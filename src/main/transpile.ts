import { transform as sucraseTransform, type Transform } from 'sucrase'
import type { Language } from '../shared/types'

/**
 * Strips types and/or JSX. JSX uses the automatic runtime, so snippets do not
 * need to import React.
 */
export function transpile(code: string, language: Language): string {
  const transforms: Transform[] = []
  if (language === 'typescript' || language === 'tsx') transforms.push('typescript')
  if (language === 'jsx' || language === 'tsx') transforms.push('jsx')
  return sucraseTransform(code, {
    transforms,
    disableESTransforms: true,
    jsxRuntime: 'automatic',
    production: false
  }).code
}
