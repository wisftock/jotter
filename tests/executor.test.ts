import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Executor, type ExecuteMessage } from '../src/main/executor'
import type { Language } from '../src/shared/types'

interface Message {
  type: string
  level?: string
  text?: string
  label?: string
  ok?: boolean
  error?: { name: string; message: string; stack?: string; package?: string }
}

class Harness {
  messages: Message[] = []
  send = (message: unknown): void => {
    this.messages.push(message as Message)
  }
  logs(): Message[] {
    return this.messages.filter((m) => m.type === 'log')
  }
  result(): Message | undefined {
    return this.messages.find((m) => m.type === 'result')
  }
}

const workspace = mkdtempSync(join(tmpdir(), 'jotter-exec-'))
mkdirSync(join(workspace, 'node_modules', 'fake-pkg'), { recursive: true })
writeFileSync(
  join(workspace, 'node_modules', 'fake-pkg', 'package.json'),
  JSON.stringify({ name: 'fake-pkg', version: '1.0.0', main: 'index.js' })
)
writeFileSync(
  join(workspace, 'node_modules', 'fake-pkg', 'index.js'),
  'module.exports = { double: (n) => n * 2 }'
)

let harness: Harness
let executor: Executor

beforeEach(() => {
  harness = new Harness()
  executor = new Executor(workspace, harness.send)
})

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true })
})

function run(code: string, language: Language = 'javascript'): Promise<void> {
  const message: ExecuteMessage = { type: 'run', id: `t-${Date.now()}`, code, language }
  return executor.run(message)
}

describe('Executor', () => {
  it('captures console output and the last expression', async () => {
    await run("console.log('hello', 1)\n2 + 3")
    const logs = harness.logs()
    expect(logs[0]).toMatchObject({ level: 'log', text: 'hello 1' })
    expect(logs.at(-1)).toMatchObject({ level: 'result', text: '5' })
    expect(harness.result()).toMatchObject({ ok: true })
  })

  it('runs TypeScript after stripping types', async () => {
    await run('const n: number = 41\nconst msg: string = "ok"\nn + 1', 'typescript')
    expect(harness.logs().at(-1)?.text).toBe('42')
  })

  it('renders magic comments with their label', async () => {
    await run('[1, 2, 3].map((x) => x * 2) //? doubled')
    const magic = harness.logs().find((l) => l.label === 'doubled')
    expect(magic?.text).toBe('[ 2, 4, 6 ]')
  })

  it('supports top-level await', async () => {
    await run('const value = await Promise.resolve(20)\nvalue + 1')
    expect(harness.logs().at(-1)?.text).toBe('21')
  })

  it('resolves packages with require() from the workspace', async () => {
    await run("const pkg = require('fake-pkg')\npkg.double(21)")
    expect(harness.logs().at(-1)?.text).toBe('42')
  })

  it('resolves packages with import from the workspace', async () => {
    await run("import pkg from 'fake-pkg'\npkg.double(21)")
    expect(harness.logs().at(-1)?.text).toBe('42')
  })

  it('shows the result of every top-level expression', async () => {
    await run('Math.max(1, 2)\nMath.max(3, 4)')
    const results = harness
      .logs()
      .filter((l) => l.level === 'result')
      .map((l) => l.text)
    expect(results).toEqual(['2', '4'])
  })

  it('flags missing packages so the UI can offer to install them', async () => {
    await run("import x from 'definitely-not-real-pkg-xyz'")
    const error = harness.messages.find((m) => m.type === 'error')
    expect(error?.error?.package).toBe('definitely-not-real-pkg-xyz')
  })

  it('reports errors with a mapped stack', async () => {
    await run("function boom() {\n  throw new Error('kaboom')\n}\nboom()")
    const error = harness.messages.find((m) => m.type === 'error')
    expect(error?.error?.message).toBe('kaboom')
    expect(error?.error?.stack).toContain('your-code')
    expect(harness.result()).toMatchObject({ ok: false })
  })
})
