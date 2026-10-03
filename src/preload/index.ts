import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  BundleResult,
  Language,
  NpmPackage,
  NpmProgress,
  RunError,
  RunnerLog,
  RunParams,
  RunResult,
  Snippet
} from '../shared/types'

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  info: (): Promise<{ workspace: string; version: string; platform: string }> =>
    ipcRenderer.invoke('app:info'),

  run: (params: RunParams): Promise<boolean> => ipcRenderer.invoke('code:run', params),

  bundle: (params: { code: string; language: Language }): Promise<BundleResult> =>
    ipcRenderer.invoke('code:bundle', params),

  onLog: (cb: (log: RunnerLog) => void): (() => void) => subscribe('run:log', cb),
  onError: (cb: (error: RunError) => void): (() => void) => subscribe('run:error', cb),
  onResult: (cb: (result: RunResult) => void): (() => void) => subscribe('run:result', cb),

  npm: {
    list: (): Promise<NpmPackage[]> => ipcRenderer.invoke('npm:list'),
    install: (packages: string[]): Promise<number> => ipcRenderer.invoke('npm:install', packages),
    uninstall: (packages: string[]): Promise<number> =>
      ipcRenderer.invoke('npm:uninstall', packages),
    onProgress: (cb: (progress: NpmProgress) => void): (() => void) =>
      subscribe('npm:progress', cb),
    onDone: (
      cb: (payload: { action: string; packages: string[]; code: number; list: NpmPackage[] }) => void
    ): (() => void) => subscribe('npm:done', cb)
  },

  snippets: {
    all: (): Promise<Snippet[]> => ipcRenderer.invoke('snippets:all'),
    save: (snippet: Snippet): Promise<Snippet> => ipcRenderer.invoke('snippets:save', snippet),
    remove: (id: string): Promise<boolean> => ipcRenderer.invoke('snippets:delete', id)
  }
}

export type WisfJsApi = typeof api

contextBridge.exposeInMainWorld('wisfjs', api)
