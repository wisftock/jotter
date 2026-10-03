import * as esbuild from 'esbuild'
import { transformCode } from '../shared/transform'
import { transpile } from './transpile'
import type { BundleResult, Language } from '../shared/types'

function missingPackageFromMessage(message: string): string | undefined {
  const match = /Could not resolve "([^"]+)"/.exec(message)
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

/**
 * Bundles a snippet for the browser environment, resolving npm packages
 * (react, react-dom, ...) from the workspace. JSX uses the automatic runtime.
 */
export async function bundleForBrowser(
  code: string,
  language: Language,
  workspace: string
): Promise<BundleResult> {
  try {
    const js = transformCode(transpile(code, language))
    const result = await esbuild.build({
      stdin: {
        contents: js,
        resolveDir: workspace,
        sourcefile: 'snippet.js',
        loader: 'js'
      },
      bundle: true,
      platform: 'browser',
      format: 'iife',
      target: 'es2020',
      write: false,
      logLevel: 'silent',
      jsx: 'automatic',
      jsxImportSource: 'react'
    })
    const out = result.outputFiles?.[0]?.text ?? ''
    return { ok: true, code: out }
  } catch (err) {
    const error = err as Error & {
      errors?: Array<{ text: string; location?: { line: number; column: number } }>
    }
    let message = error.message
    if (error.errors && error.errors.length) {
      message = error.errors
        .map(
          (item) =>
            `${item.text}${
              item.location ? ` (line ${item.location.line}, column ${item.location.column})` : ''
            }`
        )
        .join('\n')
    }
    return {
      ok: false,
      error: { name: 'Error', message, package: missingPackageFromMessage(message) }
    }
  }
}
