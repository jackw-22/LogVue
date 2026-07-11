import { usePickArchiveRoot } from '../api/hooks'

export default function EmptyState(): JSX.Element {
  const pick = usePickArchiveRoot()
  return (
    <div className="empty-state">
      <div className="empty-card">
        <h1>LogVue</h1>
        <p className="muted">
          Choose (or create) a folder to hold your FTC log library. Everything is stored as plain
          folders you can browse, copy, and back up — LogVue just organises them.
        </p>
        <button onClick={() => pick.mutate()} disabled={pick.isPending}>
          {pick.isPending ? 'Opening…' : 'Choose library folder'}
        </button>
      </div>
    </div>
  )
}
