import { useEffect, useRef } from 'react'
import type { LogEntry } from '../../shared/types'

interface OutputPanelProps {
  logs: LogEntry[]
  running: boolean
  duration: number | null
  env: 'node' | 'browser'
  showWebView: boolean
  onClear: () => void
  onInstallPackage: (name: string) => void
}

export function OutputPanel({
  logs,
  running,
  duration,
  env,
  showWebView,
  onClear,
  onInstallPackage
}: OutputPanelProps) {
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [logs])

  return (
    <section className="output">
      <header className="output-header">
        <span className="output-title">Console</span>
        <span className={`badge badge-${env}`}>{env === 'node' ? 'Node.js' : 'Browser'}</span>
        <span className="spacer" />
        {running ? (
          <span className="status running">running…</span>
        ) : duration !== null ? (
          <span className="status">{duration} ms</span>
        ) : null}
        <button className="ghost" onClick={onClear} title="Clear console">
          Clear
        </button>
      </header>
      <div
        id="wisfjs-webview"
        className={`webview-slot ${showWebView && env === 'browser' ? 'open' : ''}`}
      />
      <div className="output-body">
        {logs.length === 0 && !running ? (
          <div className="output-empty">Output appears here as you type.</div>
        ) : null}
        {logs.map((log) => (
          <div key={log.id} className={`log log-${log.level}`}>
            {log.level === 'result' ? <span className="log-result-mark">=</span> : null}
            {log.label ? <span className="log-label">{log.label}</span> : null}
            <span className="log-text">{log.text}</span>
            {log.level === 'error' && log.package ? (
              <button
                className="install-btn"
                onClick={() => onInstallPackage(log.package as string)}
              >
                Install {log.package}
              </button>
            ) : null}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </section>
  )
}
