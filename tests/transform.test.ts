import { describe, expect, it } from 'vitest'
import vm from 'node:vm'
import { transformCode } from '../src/shared/transform'

interface Evaluated {
  logs: Array<{ value: unknown; label?: string }>
  result: unknown
}

function evaluate(source: string): Evaluated {
  const logs: Array<{ value: unknown; label?: string }> = []
  const context = vm.createContext({
    __JOTTER_LOG__: (value: unknown, label?: string, auto?: boolean): void => {
      if (auto && value === undefined) return
      logs.push({ value, label })
    },
    __JOTTER_RESULT__: undefined
  })
  vm.runInContext(transformCode(source), context)
  return { logs, result: context.__JOTTER_RESULT__ }
}

describe('transformCode', () => {
  it('logs the value of every top-level expression without a label', () => {
    const { logs } = evaluate('Math.max(1, 2)\nMath.max(3, 4)')
    expect(logs.map((l) => l.value)).toEqual([2, 4])
    expect(logs.every((l) => l.label === undefined)).toBe(true)
  })

  it('skips expressions that evaluate to undefined', () => {
    const { logs } = evaluate('void 0')
    expect(logs).toEqual([])
  })

  it('captures the last declaration initializer', () => {
    const { result } = evaluate('const total = 40 + 2')
    expect(result).toBe(42)
  })

  it('logs expressions tagged with a magic comment', () => {
    const { logs } = evaluate('const nums = [1, 2]\nnums.map((n) => n * 2) //? doubled')
    const magic = logs.filter((l) => l.label === 'doubled')
    expect(magic).toHaveLength(1)
    expect(magic[0].value).toEqual([2, 4])
  })

  it('keeps the binding when a declaration has a magic comment', () => {
    const { logs } = evaluate('const nums = [1, 2, 3] //? nums\nnums.length')
    expect(logs[0]).toMatchObject({ label: 'nums', value: [1, 2, 3] })
    expect(logs.at(-1)?.value).toBe(3)
  })

  it('shows only the value when the magic comment has no text', () => {
    const { logs } = evaluate('1 + 1 //?')
    expect(logs[0].label).toBeUndefined()
    expect(logs[0].value).toBe(2)
  })

  it('does not double-log a magic-tagged expression', () => {
    const { logs } = evaluate('const value = 7\nvalue //?')
    expect(logs).toHaveLength(1)
    expect(logs[0].value).toBe(7)
  })

  it('returns the original source when it cannot be parsed', () => {
    const broken = 'const = = ='
    expect(transformCode(broken)).toBe(broken)
  })
})
