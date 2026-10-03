import { afterAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SnippetStore } from '../src/main/snippets'
import type { Snippet } from '../src/shared/types'

const dir = mkdtempSync(join(tmpdir(), 'wisfjs-snippets-'))
const store = new SnippetStore(join(dir, 'snippets.json'))

function make(id: string, name: string): Snippet {
  const now = Date.now()
  return {
    id,
    name,
    code: `console.log(${JSON.stringify(name)})`,
    language: 'javascript',
    env: 'node',
    createdAt: now,
    updatedAt: now
  }
}

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('SnippetStore', () => {
  it('starts empty', () => {
    expect(store.all()).toEqual([])
  })

  it('persists snippets', () => {
    store.save(make('1', 'first'))
    store.save(make('2', 'second'))
    const names = store.all().map((s) => s.name)
    expect(names).toContain('first')
    expect(names).toContain('second')
  })

  it('updates an existing snippet by id', () => {
    const original = make('3', 'draft')
    store.save(original)
    store.save({ ...original, name: 'renamed', code: '// updated' })
    const found = store.all().find((s) => s.id === '3')
    expect(found?.name).toBe('renamed')
    expect(found?.code).toBe('// updated')
  })

  it('deletes snippets', () => {
    store.save(make('4', 'temporary'))
    store.delete('4')
    expect(store.all().find((s) => s.id === '4')).toBeUndefined()
  })
})
