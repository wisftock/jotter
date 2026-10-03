import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CodeEditor } from './CodeEditor'
import { OutputPanel } from './OutputPanel'
import { SnippetsPanel } from './SnippetsPanel'
import { PackagesPanel } from './PackagesPanel'
import { TabBar } from './TabBar'
import { useRunner } from './useRunner'
import type { Language, NpmPackage, RunEnv, Snippet, WorkTab } from '../../shared/types'

const LANGUAGES: Array<{ id: Language; label: string }> = [
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'jsx', label: 'JSX' },
  { id: 'tsx', label: 'TSX' }
]

const SAMPLE = `// Magic comments show values inline: add  //?  to any line
const numbers = [1, 2, 3, 4, 5]
const doubled = numbers.map((n) => n * 2)
doubled //?

// Every expression is evaluated and shown, so calling a function
// several times shows each result.
doubled.reduce((total, n) => total + n, 0)
`

const INITIAL_TABS = 3

type SideTab = 'snippets' | 'packages' | null

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function makeTab(
  name: string,
  code = '',
  language: Language = 'javascript',
  env: RunEnv = 'node'
): WorkTab {
  return { id: uid(), name, code, language, env }
}

function createInitialTabs(): WorkTab[] {
  return Array.from({ length: INITIAL_TABS }, (_, index) =>
    makeTab(`Tab ${index + 1}`, index === 0 ? SAMPLE : '')
  )
}

export default function App() {
  const [tabs, setTabs] = useState<WorkTab[]>(createInitialTabs)
  const [activeId, setActiveId] = useState(() => tabs[0]?.id ?? uid())
  const [autoRun, setAutoRun] = useState(true)
  const [showWebView, setShowWebView] = useState(false)
  const [sideTab, setSideTab] = useState<SideTab>(null)
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [packages, setPackages] = useState<NpmPackage[]>([])
  const [npmOutput, setNpmOutput] = useState('')
  const [installing, setInstalling] = useState(false)
  const [workspace, setWorkspace] = useState('')

  const { logs, state, run, clear, dropTab } = useRunner()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const active = useMemo(() => tabs.find((t) => t.id === activeId), [tabs, activeId])
  const activeLogs = logs[activeId] ?? []
  const activeState = state[activeId] ?? { running: false, duration: null }

  const patchTab = useCallback((id: string, patch: Partial<WorkTab>) => {
    setTabs((prev) => prev.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab)))
  }, [])

  const currentRun = useCallback(() => {
    if (active) run({ tabId: active.id, code: active.code, language: active.language, env: active.env })
  }, [active, run])

  useEffect(() => {
    if (!autoRun || !active) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      run({ tabId: active.id, code: active.code, language: active.language, env: active.env })
    }, 450)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [active, autoRun, run])

  useEffect(() => {
    void window.wisfjs.info().then((info) => setWorkspace(info.workspace))
    void window.wisfjs.snippets.all().then(setSnippets)
    void window.wisfjs.npm.list().then(setPackages)
  }, [])

  useEffect(() => {
    const offProgress = window.wisfjs.npm.onProgress((progress) => {
      setNpmOutput((prev) => prev + progress.data)
    })
    const offDone = window.wisfjs.npm.onDone((payload) => {
      setInstalling(false)
      setPackages(payload.list)
    })
    return () => {
      offProgress()
      offDone()
    }
  }, [])

  const handleAddTab = useCallback(() => {
    const tab = makeTab(`Tab ${tabs.length + 1}`)
    setTabs((prev) => [...prev, tab])
    setActiveId(tab.id)
  }, [tabs.length])

  const handleCloseTab = useCallback(
    (id: string) => {
      if (tabs.length === 1) return
      const index = tabs.findIndex((t) => t.id === id)
      const next = tabs.filter((t) => t.id !== id)
      if (id === activeId) {
        setActiveId(next[Math.min(index, next.length - 1)].id)
      }
      setTabs(next)
      dropTab(id)
    },
    [tabs, activeId, dropTab]
  )

  const handleRenameTab = useCallback(
    (id: string, name: string) => patchTab(id, { name }),
    [patchTab]
  )

  const handleSaveSnippet = useCallback(
    async (name: string) => {
      if (!active) return
      const now = Date.now()
      const snippet: Snippet = {
        id: uid(),
        name,
        code: active.code,
        language: active.language,
        env: active.env,
        createdAt: now,
        updatedAt: now
      }
      await window.wisfjs.snippets.save(snippet)
      setSnippets(await window.wisfjs.snippets.all())
    },
    [active]
  )

  const handleOpenSnippet = useCallback((snippet: Snippet) => {
    const tab = makeTab(snippet.name, snippet.code, snippet.language, snippet.env)
    setTabs((prev) => [...prev, tab])
    setActiveId(tab.id)
    setSideTab(null)
  }, [])

  const handleDeleteSnippet = useCallback(async (id: string) => {
    await window.wisfjs.snippets.remove(id)
    setSnippets(await window.wisfjs.snippets.all())
  }, [])

  const handleInstall = useCallback(async (names: string[]) => {
    setInstalling(true)
    setNpmOutput('')
    await window.wisfjs.npm.install(names)
  }, [])

  const handleUninstall = useCallback(async (name: string) => {
    setInstalling(true)
    setNpmOutput('')
    await window.wisfjs.npm.uninstall([name])
  }, [])

  const handleInstallPackage = useCallback(
    async (name: string) => {
      setInstalling(true)
      setNpmOutput('')
      await window.wisfjs.npm.install([name])
      if (active) {
        run({ tabId: active.id, code: active.code, language: active.language, env: active.env })
      }
    },
    [active, run]
  )

  const envHint = useMemo(() => {
    if (active?.env === 'browser') {
      return 'Browser environment: DOM, Web APIs and npm packages (react, react-dom…). Enable Web View to render UI, and use JSX/TSX for React.'
    }
    return 'Node.js environment: full Node APIs, require/import and installed npm packages.'
  }, [active?.env])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-logo">JS</span>
          <span className="brand-name">WisfJS</span>
        </div>

        <div className="segmented" role="group" aria-label="Language">
          {LANGUAGES.map((item) => (
            <button
              key={item.id}
              className={active?.language === item.id ? 'active' : ''}
              onClick={() => active && patchTab(active.id, { language: item.id })}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="segmented" role="group" aria-label="Environment">
          <button
            className={active?.env === 'node' ? 'active' : ''}
            onClick={() => active && patchTab(active.id, { env: 'node' })}
          >
            Node
          </button>
          <button
            className={active?.env === 'browser' ? 'active' : ''}
            onClick={() => active && patchTab(active.id, { env: 'browser' })}
          >
            Browser
          </button>
        </div>

        <label className="autorun">
          <input type="checkbox" checked={autoRun} onChange={(e) => setAutoRun(e.target.checked)} />
          Auto-run
        </label>

        <label className="autorun">
          <input
            type="checkbox"
            checked={showWebView}
            onChange={(e) => setShowWebView(e.target.checked)}
          />
          Web View
        </label>

        <span className="spacer" />

        <button
          className="ghost"
          onClick={() => setSideTab(sideTab === 'snippets' ? null : 'snippets')}
        >
          Snippets
        </button>
        <button
          className="ghost"
          onClick={() => setSideTab(sideTab === 'packages' ? null : 'packages')}
        >
          Packages
        </button>
        <button className="primary" onClick={currentRun} title="Ctrl/Cmd + Enter">
          Run ▷
        </button>
      </header>

      <TabBar
        tabs={tabs}
        activeId={activeId}
        onSelect={setActiveId}
        onAdd={handleAddTab}
        onClose={handleCloseTab}
        onRename={handleRenameTab}
      />

      <div className="content">
        <main className="workspace">
          <div className="editor-pane">
            <CodeEditor
              code={active?.code ?? ''}
              language={active?.language ?? 'javascript'}
              onChange={(value) => active && patchTab(active.id, { code: value })}
              onRun={currentRun}
            />
            <div className="env-hint">{envHint}</div>
          </div>
          <OutputPanel
            logs={activeLogs}
            running={activeState.running}
            duration={activeState.duration}
            env={active?.env ?? 'node'}
            showWebView={showWebView}
            onClear={() => active && clear(active.id)}
            onInstallPackage={handleInstallPackage}
          />
        </main>

        {sideTab ? (
          <aside className="sidepanel">
            <header className="sidepanel-header">
              <div className="tabs">
                <button
                  className={sideTab === 'snippets' ? 'active' : ''}
                  onClick={() => setSideTab('snippets')}
                >
                  Snippets
                </button>
                <button
                  className={sideTab === 'packages' ? 'active' : ''}
                  onClick={() => setSideTab('packages')}
                >
                  Packages
                </button>
              </div>
              <button className="ghost" onClick={() => setSideTab(null)}>
                ✕
              </button>
            </header>
            {sideTab === 'snippets' ? (
              <SnippetsPanel
                snippets={snippets}
                onOpen={handleOpenSnippet}
                onSave={handleSaveSnippet}
                onDelete={handleDeleteSnippet}
              />
            ) : (
              <PackagesPanel
                packages={packages}
                installing={installing}
                output={npmOutput}
                onInstall={handleInstall}
                onUninstall={handleUninstall}
              />
            )}
          </aside>
        ) : null}
      </div>

      <footer className="statusbar">
        <span className="status-path" title={workspace}>
          workspace: {workspace || '…'}
        </span>
        <span className="spacer" />
        <span>
          Magic comments: add <code>{'//?'}</code>
        </span>
      </footer>
    </div>
  )
}
