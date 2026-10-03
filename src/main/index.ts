import { app, shell, dialog, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { NodeRunner } from './runnerProcess'
import { SnippetStore } from './snippets'
import { NpmManager } from './npmManager'
import { bundleForBrowser } from './bundler'
import type { Language } from '../shared/types'
import type {
  LogEntry,
  NpmProgress,
  RunError,
  RunParams,
  RunResult,
  Snippet
} from '../shared/types'

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null
let runner: NodeRunner | null = null
let npmManager: NpmManager | null = null
let snippets: SnippetStore | null = null
let workspaceDir = ''
let allowClose = false
let deleteOnQuit = false

function ensureWorkspace(dir: string): void {
  mkdirSync(dir, { recursive: true })
  const pkgPath = join(dir, 'package.json')
  if (!existsSync(pkgPath)) {
    writeFileSync(
      pkgPath,
      JSON.stringify(
        {
          name: 'wisfjs-workspace',
          version: '1.0.0',
          private: true,
          type: 'module',
          description: 'Workspace used by WisfJS to install npm packages.'
        },
        null,
        2
      ),
      'utf8'
    )
  }
}

/** Removes only the temporary files produced while running snippets. */
function cleanTemp(dir: string): void {
  try {
    rmSync(join(dir, '.wisfjs'), { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}

/**
 * Prepares the workspace on startup. Temporary files are always removed while
 * previously installed packages are kept (the user decides on close whether to
 * delete them).
 */
function prepareWorkspace(dir: string): void {
  ensureWorkspace(dir)
  cleanTemp(dir)
}

/** Removes the whole workspace, including installed npm packages. */
function wipeWorkspace(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}

function send(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload)
  }
}

function createWindow(): void {
  allowClose = false
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 760,
    minHeight: 520,
    show: false,
    backgroundColor: '#17181c',
    title: 'WisfJS',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Before closing, ask what to do with the installed packages.
  mainWindow.on('close', (event) => {
    if (allowClose) return
    const installed = npmManager?.list() ?? []
    if (installed.length === 0) return

    event.preventDefault()
    const parent = mainWindow
    void dialog
      .showMessageBox(parent as BrowserWindow, {
        type: 'question',
        buttons: ['Keep packages', 'Delete everything', 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
        title: 'WisfJS',
        message: `You have ${installed.length} installed npm package(s).`,
        detail: `${installed.map((p) => p.name).join(', ')}\n\nKeep them for your next session, or delete everything?`
      })
      .then(({ response }) => {
        if (response === 2) return
        deleteOnQuit = response === 1
        allowClose = true
        parent?.close()
      })
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (isDev && devUrl) {
    void mainWindow.loadURL(devUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

}

function registerIpc(): void {
  ipcMain.handle('app:info', () => ({
    workspace: workspaceDir,
    version: app.getVersion(),
    platform: process.platform
  }))

  ipcMain.handle('code:run', (_event, params: RunParams) => {
    runner?.run(params)
    return true
  })

  ipcMain.handle(
    'code:bundle',
    (_event, params: { code: string; language: Language }) =>
      bundleForBrowser(params.code, params.language, workspaceDir)
  )

  ipcMain.handle('npm:list', () => npmManager?.list() ?? [])

  ipcMain.handle('npm:install', async (_event, packages: string[]) => {
    const code = await npmManager?.install(packages, (p: NpmProgress) => send('npm:progress', p))
    send('npm:done', { action: 'install', packages, code: code ?? 0, list: npmManager?.list() ?? [] })
    return code ?? 0
  })

  ipcMain.handle('npm:uninstall', async (_event, packages: string[]) => {
    const code = await npmManager?.uninstall(packages, (p: NpmProgress) => send('npm:progress', p))
    send('npm:done', { action: 'uninstall', packages, code: code ?? 0, list: npmManager?.list() ?? [] })
    return code ?? 0
  })

  ipcMain.handle('snippets:all', () => snippets?.all() ?? [])
  ipcMain.handle('snippets:save', (_event, snippet: Snippet) => snippets?.save(snippet))
  ipcMain.handle('snippets:delete', (_event, id: string) => {
    snippets?.delete(id)
    return true
  })
}

app.whenReady().then(() => {
  workspaceDir = join(app.getPath('userData'), 'workspace')
  prepareWorkspace(workspaceDir)

  snippets = new SnippetStore(join(app.getPath('userData'), 'snippets.json'))
  npmManager = new NpmManager(workspaceDir)
  runner = new NodeRunner(workspaceDir)
  runner.on('message', (message: Record<string, unknown>) => {
    switch (message.type) {
      case 'log':
        send('run:log', message as unknown as LogEntry)
        break
      case 'error':
        send('run:error', message.error as RunError)
        break
      case 'result':
        send('run:result', message as unknown as RunResult)
        break
      default:
        break
    }
  })
  // The Node runtime process is started lazily on the first Node run so it
  // does not consume memory when only the browser environment is used.

  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  runner?.dispose()
})

// Always clear temporary files; the packages are kept unless the user asked to
// delete everything when closing.
app.on('will-quit', () => {
  if (!workspaceDir) return
  if (deleteOnQuit) wipeWorkspace(workspaceDir)
  else cleanTemp(workspaceDir)
})
