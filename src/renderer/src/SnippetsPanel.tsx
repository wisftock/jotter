import { useState } from 'react'
import type { Snippet } from '../../shared/types'

const LANGUAGE_LABEL: Record<string, string> = {
  javascript: 'JS',
  typescript: 'TS',
  jsx: 'JSX',
  tsx: 'TSX'
}

interface SnippetsPanelProps {
  snippets: Snippet[]
  onOpen: (snippet: Snippet) => void
  onSave: (name: string) => void
  onDelete: (id: string) => void
}

export function SnippetsPanel({ snippets, onOpen, onSave, onDelete }: SnippetsPanelProps) {
  const [name, setName] = useState('')

  const save = (): void => {
    const value = name.trim()
    if (!value) return
    onSave(value)
    setName('')
  }

  return (
    <div className="panel">
      <div className="panel-row">
        <input
          className="text-input"
          placeholder="Snippet name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
          }}
        />
        <button className="primary" onClick={save} disabled={!name.trim()}>
          Save
        </button>
      </div>
      <div className="panel-list">
        {snippets.length === 0 ? <div className="panel-empty">No saved snippets yet.</div> : null}
        {snippets.map((snippet) => (
          <div key={snippet.id} className="snippet-item">
            <button className="snippet-open" onClick={() => onOpen(snippet)}>
              <span className="snippet-name">{snippet.name}</span>
              <span className="snippet-meta">
                {LANGUAGE_LABEL[snippet.language] ?? 'JS'} · {snippet.env}
              </span>
            </button>
            <button
              className="ghost danger"
              onClick={() => onDelete(snippet.id)}
              title="Delete snippet"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
