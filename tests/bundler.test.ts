import { afterAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bundleForBrowser } from '../src/main/bundler'

const workspace = mkdtempSync(join(tmpdir(), 'wisfjs-bundle-'))

afterAll(() => rmSync(workspace, { recursive: true, force: true }))

describe('bundleForBrowser', () => {
  it('bundles a plain snippet into an IIFE with the log hook', async () => {
    const result = await bundleForBrowser('1 + 1', 'javascript', workspace)
    expect(result.ok).toBe(true)
    expect(result.code).toContain('__WISF_LOG__')
  })

  it('reports the missing package from a bundle error', async () => {
    const result = await bundleForBrowser(
      "import x from 'no-such-pkg-xyz'\nconsole.log(x)",
      'javascript',
      workspace
    )
    expect(result.ok).toBe(false)
    expect(result.error?.package).toBe('no-such-pkg-xyz')
  })
})
