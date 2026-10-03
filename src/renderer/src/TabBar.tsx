import { useState } from 'react'
import type { WorkTab } from '../../shared/types'

interface TabBarProps {
  tabs: WorkTab[]
  activeId: string
  onSelect: (id: string) => void
  onAdd: () => void
  onClose: (id: string) => void
  onRename: (id: string, name: string) => void
}

export function TabBar({ tabs, activeId, onSelect, onAdd, onClose, onRename }: TabBarProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const startRename = (tab: WorkTab): void => {
    setEditingId(tab.id)
    setDraft(tab.name)
  }

  const commit = (): void => {
    if (editingId) {
      const name = draft.trim()
      if (name) onRename(editingId, name)
    }
    setEditingId(null)
  }

  return (
    <div className="tabbar" role="tablist">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tab"
          aria-selected={tab.id === activeId}
          className={`tab ${tab.id === activeId ? 'active' : ''}`}
          onClick={() => onSelect(tab.id)}
          onDoubleClick={() => startRename(tab)}
          title="Double-click to rename"
        >
          {editingId === tab.id ? (
            <input
              className="tab-input"
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit()
                if (e.key === 'Escape') setEditingId(null)
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="tab-name">{tab.name}</span>
          )}
          <button
            className="tab-close"
            onClick={(e) => {
              e.stopPropagation()
              onClose(tab.id)
            }}
            title="Close tab"
            disabled={tabs.length === 1}
          >
            ×
          </button>
        </div>
      ))}
      <button className="tab-add" onClick={onAdd} title="New tab">
        +
      </button>
    </div>
  )
}
