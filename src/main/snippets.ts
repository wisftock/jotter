import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Snippet } from '../shared/types'

export class SnippetStore {
  private readonly file: string

  constructor(file: string) {
    this.file = file
  }

  private read(): Snippet[] {
    try {
      if (!existsSync(this.file)) return []
      const raw = readFileSync(this.file, 'utf8')
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as Snippet[]) : []
    } catch {
      return []
    }
  }

  private write(snippets: Snippet[]): void {
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, JSON.stringify(snippets, null, 2), 'utf8')
  }

  all(): Snippet[] {
    return this.read().sort((a, b) => b.updatedAt - a.updatedAt)
  }

  save(snippet: Snippet): Snippet {
    const snippets = this.read()
    const index = snippets.findIndex((s) => s.id === snippet.id)
    const now = Date.now()
    const next: Snippet = { ...snippet, updatedAt: now }
    if (index >= 0) snippets[index] = next
    else snippets.push(next)
    this.write(snippets)
    return next
  }

  delete(id: string): void {
    this.write(this.read().filter((s) => s.id !== id))
  }
}
