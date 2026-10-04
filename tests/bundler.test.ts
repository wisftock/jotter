import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bundleForBrowser } from '../src/main/bundler'

const workspace = mkdtempSync(join(tmpdir(), 'jotter-bundle-'))

// Minimal React stand-in so JSX/TSX bundling can be verified without network.
beforeAll(() => {
  mkdirSync(join(workspace, 'node_modules', 'react'), { recursive: true })
  writeFileSync(
    join(workspace, 'node_modules', 'react', 'package.json'),
    JSON.stringify({ name: 'react', version: '1.0.0', main: 'index.js' })
  )
  writeFileSync(
    join(workspace, 'node_modules', 'react', 'jsx-runtime.js'),
    'exports.jsx = (t, p) => ({ t, p })\nexports.jsxs = (t, p) => ({ t, p })\n'
  )
  writeFileSync(
    join(workspace, 'node_modules', 'react', 'jsx-dev-runtime.js'),
    'exports.jsxDEV = (t, p) => ({ t, p })\n'
  )
})

afterAll(() => rmSync(workspace, { recursive: true, force: true }))

describe('bundleForBrowser', () => {
  it('bundles a plain snippet into an IIFE with the log hook', async () => {
    const result = await bundleForBrowser('1 + 1', 'javascript', workspace)
    expect(result.ok).toBe(true)
    expect(result.code).toContain('__JOTTER_LOG__')
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

  it('bundles JSX with the automatic runtime', async () => {
    const result = await bundleForBrowser('const el = <h1>Hi</h1>\nel', 'jsx', workspace)
    expect(result.ok).toBe(true)
    expect(result.code).toContain('__JOTTER_LOG__')
  })

  it('bundles TSX with the automatic runtime', async () => {
    const result = await bundleForBrowser(
      'interface P { n: number }\nconst value: number = 5\nconst el = <p>{value}</p>\nel',
      'tsx',
      workspace
    )
    expect(result.ok).toBe(true)
  })

  it('bundles a real package import from the workspace', async () => {
    const result = await bundleForBrowser(
      "import { jsx } from 'react/jsx-runtime'\njsx",
      'javascript',
      workspace
    )
    expect(result.ok).toBe(true)
  })
})
