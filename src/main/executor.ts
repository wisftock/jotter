import { createRequire } from 'node:module'
import { inspect } from 'node:util'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { transformCode } from '../shared/transform'
import { transpile } from './transpile'
import type { Language } from '../shared/types'

export interface ExecuteMessage {
  type: 'run'
  id: string
  code: string
  language: Language
}

export type Send = (message: unknown) => void

/**
 * Evaluates snippets inside the current process. Kept free of IPC concerns so
 * it can be driven by the runner (over `process.send`) or by tests.
 */
export class Executor {
  private workspace: string
  private send: Send
  private activeRunId: string | undefined
  private queue: Promise<void> = Promise.resolve()

  constructor(workspace: string, send: Send) {
    this.workspace = workspace
    this.send = send
    this.setupGlobals()
  }

  configure(workspace: string): void {
    this.workspace = workspace
    this.setupGlobals()
  }

  /** Queues a run and resolves once it has finished. */
  run(message: ExecuteMessage): Promise<void> {
    const next = this.queue.then(() => this.execute(message))
    this.queue = next.catch(() => undefined)
    return next
  }

  private formatValue(value: unknown): string {
    if (typeof value === 'string') return value
    if (value === undefined) return 'undefined'
    return inspect(value, {
      depth: 5,
      colors: false,
      breakLength: 100,
      maxArrayLength: 100,
      maxStringLength: 10000,
      compact: 3
    })
  }

  private emitConsole(level: string, args: unknown[]): void {
    const text = args.map((arg) => this.formatValue(arg)).join(' ')
    this.send({ type: 'log', level, text: args.length === 0 ? '' : text, runId: this.activeRunId })
  }

  private emitLog(value: unknown, label?: string, auto = false): void {
    // Auto-logged expressions with no value are skipped to avoid noise.
    if (auto && value === undefined) return
    this.send({
      type: 'log',
      level: 'result',
      text: this.formatValue(value),
      label,
      runId: this.activeRunId
    })
  }

  private setupGlobals(): void {
    const req = createRequire(join(this.workspace, 'index.js'))
    const g = globalThis as Record<string, unknown>
    g.require = req
    g.__dirname = this.workspace
    g.__filename = join(this.workspace, 'snippet.js')
    g.__JOTTER_LOG__ = (value: unknown, label?: string, auto?: boolean): void =>
      this.emitLog(value, label, auto === true)
    g.__JOTTER_RESULT__ = undefined

    const levels: Array<'log' | 'info' | 'warn' | 'error' | 'debug'> = [
      'log',
      'info',
      'warn',
      'error',
      'debug'
    ]
    for (const level of levels) {
      ;(console as unknown as Record<string, unknown>)[level] = (...args: unknown[]): void =>
        this.emitConsole(level, args)
    }
    ;(console as unknown as Record<string, unknown>).dir = (value: unknown): void =>
      this.emitConsole('log', [value])
  }

  private async execute(message: ExecuteMessage): Promise<void> {
    const started = Date.now()
    const { id, code, language } = message
    this.activeRunId = id
    const runDir = join(this.workspace, '.jotter')
    mkdirSync(runDir, { recursive: true })
    const file = join(runDir, `run-${id || randomUUID()}.mjs`)

    try {
      const js = transpile(code, language)
      writeFileSync(file, transformCode(js), 'utf8')

      ;(globalThis as Record<string, unknown>).__JOTTER_RESULT__ = undefined
      process.setSourceMapsEnabled?.(true)

      await import(`${pathToFileURL(file).href}?v=${Date.now()}`)

      const result = (globalThis as Record<string, unknown>).__JOTTER_RESULT__
      if (result !== undefined) this.emitLog(result)

      this.send({ type: 'result', id, ok: true, duration: Date.now() - started })
    } catch (err) {
      const error = err as Error
      const stack = (error.stack || '')
        .split('\n')
        .filter((line) => !line.includes('node:internal') && !line.includes('runner.js'))
        .map((line) =>
          line.replace(new RegExp(escapeRegExp(file), 'g'), 'your-code').replace(/\?v=\d+/g, '')
        )
        .join('\n')
      this.send({
        type: 'error',
        id,
        runId: id,
        error: {
          name: error.name || 'Error',
          message: error.message || String(err),
          stack,
          runId: id,
          package: missingPackage(error)
        }
      })
      this.send({ type: 'result', id, ok: false, duration: Date.now() - started })
    } finally {
      try {
        rmSync(file, { force: true })
      } catch {
        /* ignore */
      }
    }
  }
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Extracts the bare package name from a "cannot find module/package" error so
 * the UI can offer to install it.
 */
function missingPackage(error: Error): string | undefined {
  const message = error?.message ?? ''
  const match = /Cannot find (?:package|module) '([^']+)'/.exec(message)
  if (!match) return undefined
  const specifier = match[1]
  if (
    specifier.startsWith('.') ||
    specifier.startsWith('/') ||
    specifier.startsWith('node:') ||
    specifier.startsWith('file:')
  ) {
    return undefined
  }
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}
