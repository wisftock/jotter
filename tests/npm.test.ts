import { afterAll, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NpmManager } from '../src/main/npmManager'

const dir = mkdtempSync(join(tmpdir(), 'jotter-npm-'))

writeFileSync(
  join(dir, 'package.json'),
  JSON.stringify({ name: 'ws', private: true, dependencies: { 'pkg-a': '^1.0.0', 'pkg-b': '^2.0.0' } })
)
mkdirSync(join(dir, 'node_modules', 'pkg-a'), { recursive: true })
writeFileSync(
  join(dir, 'node_modules', 'pkg-a', 'package.json'),
  JSON.stringify({ name: 'pkg-a', version: '1.2.3' })
)
// pkg-b is declared but not installed on disk.

const emptyDir = mkdtempSync(join(tmpdir(), 'jotter-npm-empty-'))

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
  rmSync(emptyDir, { recursive: true, force: true })
})

describe('NpmManager.list', () => {
  it('returns declared dependencies with installed versions when available', () => {
    const list = new NpmManager(dir).list()
    expect(list).toEqual([
      { name: 'pkg-a', version: '1.2.3' },
      { name: 'pkg-b', version: '^2.0.0' }
    ])
  })

  it('returns an empty list when there is no package.json', () => {
    expect(new NpmManager(emptyDir).list()).toEqual([])
  })
})

describe('NpmManager install/uninstall (local path, no network)', () => {
  const ws = mkdtempSync(join(tmpdir(), 'jotter-npm-install-'))
  const dep = mkdtempSync(join(tmpdir(), 'jotter-local-dep-'))

  afterAll(() => {
    rmSync(ws, { recursive: true, force: true })
    rmSync(dep, { recursive: true, force: true })
  })

  it('installs a local package, lists it and uninstalls it', async () => {
    writeFileSync(
      join(ws, 'package.json'),
      JSON.stringify({ name: 'ws', private: true, type: 'module' })
    )
    writeFileSync(
      join(dep, 'package.json'),
      JSON.stringify({ name: 'local-dep', version: '1.0.0', main: 'index.js' })
    )
    writeFileSync(join(dep, 'index.js'), 'module.exports = { ok: true }')

    const manager = new NpmManager(ws)
    const installCode = await manager.install([dep], () => undefined)
    expect(installCode).toBe(0)
    expect(existsSync(join(ws, 'node_modules', 'local-dep'))).toBe(true)
    expect(manager.list().map((p) => p.name)).toContain('local-dep')

    const uninstallCode = await manager.uninstall(['local-dep'], () => undefined)
    expect(uninstallCode).toBe(0)
    expect(existsSync(join(ws, 'node_modules', 'local-dep'))).toBe(false)
    expect(manager.list().map((p) => p.name)).not.toContain('local-dep')
  }, 120_000)
})
