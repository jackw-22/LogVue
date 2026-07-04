import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import '@shared/types/api' // registers the window.api global type

/** Fetch versions/platform from the main process over IPC. */
function useAppInfo() {
  return useQuery({
    queryKey: ['app:getInfo'],
    queryFn: () => window.api.invoke('app:getInfo')
  })
}

export default function App(): JSX.Element {
  const { data: info, isLoading } = useAppInfo()
  const [pong, setPong] = useState<string | null>(null)

  async function ping() {
    setPong(await window.api.invoke('app:ping', 'hello from the renderer'))
  }

  return (
    <div className="shell">
      <header className="titlebar">
        <span className="brand">LogVue</span>
        <span className="subtitle">FTC Control Hub RLOG organiser</span>
      </header>

      <main className="stage">
        <div className="card">
          <h1>Phase 0 — wiring is live</h1>
          <p className="muted">
            Renderer → preload bridge → main process → back. If you can read the
            values below, the three-context IPC contract works end to end.
          </p>

          <dl className="info">
            <div>
              <dt>App version</dt>
              <dd>{isLoading ? '…' : info?.appVersion}</dd>
            </div>
            <div>
              <dt>Electron</dt>
              <dd>{isLoading ? '…' : info?.electron}</dd>
            </div>
            <div>
              <dt>Chromium</dt>
              <dd>{isLoading ? '…' : info?.chrome}</dd>
            </div>
            <div>
              <dt>Node</dt>
              <dd>{isLoading ? '…' : info?.node}</dd>
            </div>
            <div>
              <dt>Platform</dt>
              <dd>{isLoading ? '…' : info?.platform}</dd>
            </div>
          </dl>

          <div className="ping-row">
            <button onClick={ping}>Send IPC ping</button>
            {pong && <code className="pong">{pong}</code>}
          </div>
        </div>
      </main>
    </div>
  )
}
