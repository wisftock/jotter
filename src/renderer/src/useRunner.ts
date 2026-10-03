import { useCallback, useEffect, useRef, useState } from 'react'
import { BrowserRunner } from './browserRunner'
import type {
  Language,
  LogEntry,
  RunEnv,
  RunError,
  RunnerLog,
  RunResult
} from '../../shared/types'

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatError(error: RunError): string {
  const header = `${error.name}: ${error.message}`
  if (!error.stack) return header
  const frames = error.stack
    .split('\n')
    .slice(1)
    .filter((line) => line.trim().length > 0)
    .join('\n')
  return frames ? `${header}\n${frames}` : header
}

export interface RunRequest {
  tabId: string
  code: string
  language: Language
  env: RunEnv
}

export interface TabRunState {
  running: boolean
  duration: number | null
}

export interface UseRunnerResult {
  logs: Record<string, LogEntry[]>
  state: Record<string, TabRunState>
  run: (request: RunRequest) => void
  clear: (tabId: string) => void
  dropTab: (tabId: string) => void
}

export function useRunner(): UseRunnerResult {
  const [logs, setLogs] = useState<Record<string, LogEntry[]>>({})
  const [state, setState] = useState<Record<string, TabRunState>>({})
  const runIdToTab = useRef<Record<string, string>>({})
  const browser = useRef<BrowserRunner | null>(null)
  const browserRunId = useRef<string>('')

  const append = useCallback((tabId: string, log: RunnerLog): void => {
    setLogs((prev) => ({
      ...prev,
      [tabId]: [...(prev[tabId] ?? []), { ...log, id: uid(), time: Date.now() }]
    }))
  }, [])

  const patch = useCallback((tabId: string, next: Partial<TabRunState>): void => {
    setState((prev) => {
      const current = prev[tabId] ?? { running: false, duration: null }
      return { ...prev, [tabId]: { ...current, ...next } }
    })
  }, [])

  useEffect(() => {
    const offLog = window.wisfjs.onLog((log) => {
      const tabId = log.runId ? runIdToTab.current[log.runId] : undefined
      if (tabId) append(tabId, log)
    })
    const offError = window.wisfjs.onError((error) => {
      const tabId = error.runId ? runIdToTab.current[error.runId] : undefined
      if (tabId) {
        append(tabId, {
          level: 'error',
          text: formatError(error),
          runId: error.runId,
          package: error.package
        })
      }
    })
    const offResult = window.wisfjs.onResult((result: RunResult) => {
      const tabId = runIdToTab.current[result.id]
      if (tabId) patch(tabId, { running: false, duration: result.duration })
    })
    return () => {
      offLog()
      offError()
      offResult()
    }
  }, [append, patch])

  useEffect(() => {
    return () => browser.current?.dispose()
  }, [])

  const run = useCallback(
    (request: RunRequest): void => {
      const runId = uid()
      runIdToTab.current[runId] = request.tabId
      setLogs((prev) => ({ ...prev, [request.tabId]: [] }))
      patch(request.tabId, { running: true, duration: null })

      if (request.env === 'browser') {
        if (!browser.current) {
          browser.current = new BrowserRunner({
            onLog: (log) => {
              const tabId = runIdToTab.current[browserRunId.current]
              if (tabId) append(tabId, { ...log, runId: browserRunId.current })
            },
            onError: (error) => {
              const tabId = runIdToTab.current[browserRunId.current]
              if (tabId) {
                append(tabId, {
                  level: 'error',
                  text: formatError(error),
                  runId: browserRunId.current,
                  package: error.package
                })
              }
            },
            onResult: (result) => {
              const tabId = runIdToTab.current[browserRunId.current]
              if (tabId) patch(tabId, { running: false, duration: result.duration })
            }
          })
        }
        browserRunId.current = runId
        const myRunId = runId
        void window.wisfjs
          .bundle({ code: request.code, language: request.language })
          .then((result) => {
            if (browserRunId.current !== myRunId) return
            const tabId = runIdToTab.current[myRunId]
            if (result.ok && result.code != null) {
              browser.current?.run(result.code)
            } else {
              const error = result.error ?? { name: 'Error', message: 'Failed to bundle the snippet' }
              if (tabId) {
                append(tabId, {
                  level: 'error',
                  text: formatError(error),
                  runId: myRunId,
                  package: error.package
                })
                patch(tabId, { running: false, duration: 0 })
              }
            }
          })
      } else {
        window.wisfjs.run({
          id: runId,
          code: request.code,
          language: request.language,
          env: request.env
        })
      }
    },
    [append, patch]
  )

  const clear = useCallback((tabId: string): void => {
    setLogs((prev) => ({ ...prev, [tabId]: [] }))
  }, [])

  const dropTab = useCallback((tabId: string): void => {
    setLogs((prev) => {
      const next = { ...prev }
      delete next[tabId]
      return next
    })
    setState((prev) => {
      const next = { ...prev }
      delete next[tabId]
      return next
    })
    for (const [runId, tab] of Object.entries(runIdToTab.current)) {
      if (tab === tabId) delete runIdToTab.current[runId]
    }
  }, [])

  return { logs, state, run, clear, dropTab }
}
