import { describe, expect, it } from 'vitest'
import { computeEsbuildBinaryPath } from '../src/main/esbuildBinary'

const ASAR = '/opt/JOTTER/resources/app.asar/node_modules'
const UNPACKED = '/opt/JOTTER/resources/app.asar.unpacked/node_modules'

describe('computeEsbuildBinaryPath', () => {
  it('remaps a virtual app.asar path to the unpacked binary', () => {
    const resolve = (specifier: string): string => `${ASAR}/${specifier}`
    const exists = (p: string): boolean => p.startsWith(UNPACKED)
    const result = computeEsbuildBinaryPath(resolve, exists, 'linux')
    expect(result).toContain('app.asar.unpacked/node_modules/@esbuild/')
    expect(result).toContain('/bin/esbuild')
  })

  it('keeps an already-unpacked path (regression: app.asar.unpacked contains "app.asar")', () => {
    const resolve = (specifier: string): string => `${UNPACKED}/${specifier}`
    const result = computeEsbuildBinaryPath(resolve, () => true, 'linux')
    expect(result).toBe(`${UNPACKED}/@esbuild/linux-${process.arch}/bin/esbuild`)
  })

  it('returns null when the unpacked binary is missing', () => {
    const resolve = (specifier: string): string => `${ASAR}/${specifier}`
    const result = computeEsbuildBinaryPath(resolve, () => false, 'linux')
    expect(result).toBeNull()
  })

  it('returns a real (non-asar) path directly', () => {
    const real = '/home/user/project/node_modules/@esbuild/linux-x64/bin/esbuild'
    const result = computeEsbuildBinaryPath(() => real, () => true, 'linux')
    expect(result).toBe(real)
  })

  it('returns null when resolution throws', () => {
    const resolve = (): string => {
      throw new Error('MODULE_NOT_FOUND')
    }
    expect(computeEsbuildBinaryPath(resolve, () => true, 'linux')).toBeNull()
  })
})
