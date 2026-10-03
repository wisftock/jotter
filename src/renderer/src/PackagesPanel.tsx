import { useEffect, useRef, useState } from 'react'
import type { NpmPackage } from '../../shared/types'

interface PackagesPanelProps {
  packages: NpmPackage[]
  installing: boolean
  output: string
  onInstall: (names: string[]) => void
  onUninstall: (name: string) => void
}

export function PackagesPanel({
  packages,
  installing,
  output,
  onInstall,
  onUninstall
}: PackagesPanelProps) {
  const [query, setQuery] = useState('')
  const logRef = useRef<HTMLPreElement | null>(null)

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [output])

  const install = (): void => {
    const names = query
      .split(/[\s,]+/)
      .map((n) => n.trim())
      .filter(Boolean)
    if (names.length === 0) return
    onInstall(names)
    setQuery('')
  }

  return (
    <div className="panel">
      <div className="panel-row">
        <input
          className="text-input"
          placeholder="e.g. lodash, axios, date-fns"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') install()
          }}
        />
        <button className="primary" onClick={install} disabled={installing || !query.trim()}>
          {installing ? 'Installing…' : 'Install'}
        </button>
      </div>
      <div className="panel-hint">
        Installed into a local workspace. Import them from your code, e.g.{' '}
        <code>import _ from &apos;lodash&apos;</code>.
      </div>
      <div className="panel-list">
        {packages.length === 0 ? <div className="panel-empty">No packages installed.</div> : null}
        {packages.map((pkg) => (
          <div key={pkg.name} className="package-item">
            <span className="package-name">{pkg.name}</span>
            <span className="package-version">{pkg.version}</span>
            <button
              className="ghost danger"
              onClick={() => onUninstall(pkg.name)}
              disabled={installing}
              title="Uninstall"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      {output ? (
        <pre className="npm-output" ref={logRef}>
          {output}
        </pre>
      ) : null}
    </div>
  )
}
