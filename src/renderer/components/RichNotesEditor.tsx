import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { ClipboardEvent, FormEvent, KeyboardEvent, MouseEvent } from 'react'
import type { FolderFile } from '@shared/types/session'
import {
  logMentionMarkdown,
  parseLogMentionMarkdown,
  suggestLogMentions,
  toLogMentionCandidate,
  type LogMentionCandidate
} from '../lib/logMentions'

export interface RichNotesEditorHandle {
  appendMention: (file: FolderFile) => void
}

interface Props {
  value: string
  files: FolderFile[]
  onChange: (value: string) => void
  onMentionClick: (filename: string) => void
  onMentionCreate: (filename: string) => void
}

interface TriggerState {
  query: string
  left: number
  top: number
}

function mentionElement(filename: string, label: string): HTMLSpanElement {
  const mention = document.createElement('span')
  mention.className = 'log-mention'
  mention.contentEditable = 'false'
  mention.dataset.filename = filename
  mention.dataset.label = label
  mention.title = `Show ${filename}`
  mention.textContent = `@${label}`
  return mention
}

function renderValue(editor: HTMLDivElement, value: string): void {
  const fragment = document.createDocumentFragment()
  for (const segment of parseLogMentionMarkdown(value)) {
    fragment.append(
      segment.type === 'text'
        ? document.createTextNode(segment.value)
        : mentionElement(segment.filename, segment.label)
    )
  }
  editor.replaceChildren(fragment)
}

function serializeValue(editor: HTMLDivElement): string {
  return [...editor.childNodes]
    .map((node) => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
      if (node instanceof HTMLSpanElement && node.dataset.filename && node.dataset.label) {
        return logMentionMarkdown(node.dataset.filename, node.dataset.label)
      }
      if (node instanceof HTMLBRElement) return '\n'
      return node.textContent ?? ''
    })
    .join('')
}

function selectionInside(editor: HTMLDivElement): Selection | null {
  const selection = window.getSelection()
  if (!selection?.rangeCount || !selection.anchorNode || !editor.contains(selection.anchorNode)) return null
  return selection
}

const RichNotesEditor = forwardRef<RichNotesEditorHandle, Props>(function RichNotesEditor({
  value,
  files,
  onChange,
  onMentionClick,
  onMentionCreate
}, forwardedRef): JSX.Element {
  const shellRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const triggerRangeRef = useRef<Range | null>(null)
  const lastEmittedRef = useRef<string | null>(null)
  const [trigger, setTrigger] = useState<TriggerState | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  const suggestions = useMemo(
    () => (trigger ? suggestLogMentions(files, trigger.query) : []),
    [files, trigger]
  )

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || value === lastEmittedRef.current) return
    renderValue(editor, value)
    lastEmittedRef.current = value
  }, [value])

  useEffect(() => setActiveIndex(0), [trigger?.query])

  function emit(): void {
    const editor = editorRef.current
    if (!editor) return
    const next = serializeValue(editor)
    lastEmittedRef.current = next
    onChange(next)
  }

  function updateTrigger(): void {
    const editor = editorRef.current
    const shell = shellRef.current
    if (!editor || !shell) return
    const selection = selectionInside(editor)
    const node = selection?.anchorNode
    if (!selection || !node || node.nodeType !== Node.TEXT_NODE) {
      triggerRangeRef.current = null
      setTrigger(null)
      return
    }

    const beforeCaret = (node.textContent ?? '').slice(0, selection.anchorOffset)
    const match = /(?:^|[\s(])@([^\s@]*)$/.exec(beforeCaret)
    if (!match) {
      triggerRangeRef.current = null
      setTrigger(null)
      return
    }

    const atOffset = beforeCaret.length - match[1].length - 1
    const replaceRange = document.createRange()
    replaceRange.setStart(node, atOffset)
    replaceRange.setEnd(node, selection.anchorOffset)
    triggerRangeRef.current = replaceRange

    const caretRange = replaceRange.cloneRange()
    caretRange.collapse(false)
    const caretRect = caretRange.getBoundingClientRect()
    const shellRect = shell.getBoundingClientRect()
    const left = Math.max(8, Math.min(caretRect.left - shellRect.left, shellRect.width - 330))
    const fallbackTop = Math.min(editor.clientHeight, editor.scrollTop + 36)
    const top = caretRect.height ? caretRect.bottom - shellRect.top + 5 : fallbackTop
    setTrigger({ query: match[1], left, top })
  }

  function insertText(text: string): void {
    const editor = editorRef.current
    const selection = editor ? selectionInside(editor) : null
    if (!editor || !selection) return
    const range = selection.getRangeAt(0)
    range.deleteContents()
    const node = document.createTextNode(text)
    range.insertNode(node)
    range.setStartAfter(node)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    emit()
    updateTrigger()
  }

  function choose(candidate: LogMentionCandidate): void {
    const editor = editorRef.current
    const selection = editor ? selectionInside(editor) : null
    const range = triggerRangeRef.current
    if (!editor || !selection || !range) return

    range.deleteContents()
    const mention = mentionElement(candidate.filename, candidate.label)
    mention.classList.add('just-added')
    const trailingSpace = document.createTextNode(' ')
    range.insertNode(trailingSpace)
    range.insertNode(mention)
    range.setStartAfter(trailingSpace)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    triggerRangeRef.current = null
    setTrigger(null)
    editor.focus()
    emit()
    onMentionCreate(candidate.filename)
  }

  function appendMention(file: FolderFile): void {
    const editor = editorRef.current
    if (!editor) return

    const current = serializeValue(editor)
    const separator = current.length === 0 || current.endsWith('\n') ? '' : '\n\n'
    const candidate = toLogMentionCandidate(file)
    const mention = mentionElement(candidate.filename, candidate.label)
    mention.classList.add('just-added')
    const trailingSpace = document.createTextNode(' ')
    if (separator) editor.append(document.createTextNode(separator))
    editor.append(mention, trailingSpace)

    editor.focus({ preventScroll: true })
    const selection = window.getSelection()
    const range = document.createRange()
    range.setStartAfter(trailingSpace)
    range.collapse(true)
    selection?.removeAllRanges()
    selection?.addRange(range)
    editor.scrollIntoView({ behavior: 'smooth', block: 'center' })
    emit()
    onMentionCreate(candidate.filename)
  }

  useImperativeHandle(forwardedRef, () => ({ appendMention }))

  function handleInput(_event: FormEvent<HTMLDivElement>): void {
    emit()
    updateTrigger()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (trigger && suggestions.length > 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const direction = event.key === 'ArrowDown' ? 1 : -1
        setActiveIndex((index) => (index + direction + suggestions.length) % suggestions.length)
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        choose(suggestions[activeIndex] ?? suggestions[0])
        return
      }
    }
    if (event.key === 'Escape' && trigger) {
      event.preventDefault()
      triggerRangeRef.current = null
      setTrigger(null)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      insertText('\n')
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>): void {
    event.preventDefault()
    insertText(event.clipboardData.getData('text/plain'))
  }

  function handleEditorClick(event: MouseEvent<HTMLDivElement>): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>('.log-mention')
    const filename = target?.dataset.filename
    if (filename) onMentionClick(filename)
  }

  return (
    <div className="rich-notes-shell" ref={shellRef}>
      <div
        ref={editorRef}
        className="notes rich-notes"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label="Session notes"
        aria-multiline="true"
        data-placeholder="Add notes about this session…"
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onKeyUp={updateTrigger}
        onClick={handleEditorClick}
        onPaste={handlePaste}
        onBlur={() => window.setTimeout(() => setTrigger(null), 100)}
      />

      {trigger && suggestions.length > 0 && (
        <div
          className="mention-menu"
          role="listbox"
          aria-label="Logs in this session"
          style={{ left: trigger.left, top: trigger.top }}
        >
          {suggestions.map((candidate, index) => (
            <button
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? 'active' : ''}
              key={candidate.filename}
              onMouseDown={(event) => {
                event.preventDefault()
                choose(candidate)
              }}
            >
              <strong>@{candidate.opmode}</strong>
              <span>{candidate.detail}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
})

export default RichNotesEditor
