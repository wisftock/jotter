import { afterAll, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NpmManager } from '../src/main/npmManager'

const dir = mkdtempSync(join(tmpdir(), 'wisfjs-npm-'))

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

const emptyDir = mkdtempSync(join(tmpdir(), 'wisfjs-npm-empty-'))

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
