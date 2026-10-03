import { parse } from 'acorn'
import type { Node } from 'acorn'

interface Replacement {
  start: number
  end: number
  code: string
}

type ExprNode = Node & {
  expression?: Node
  directive?: string
  declarations?: Array<{ init?: Node }>
}

interface CommentInfo {
  start: number
  line: number
  text: string
}

/**
 * Rewrites plain JavaScript so that:
 *  - Every top-level expression statement logs its value (like a REPL), so
 *    calling the same function several times shows every result.
 *  - Expressions followed by a `//?` magic comment are logged with the chosen
 *    label and always shown, even when the value is `undefined`.
 *  - If the program ends with a declaration, its value is captured on
 *    `globalThis.__WISF_RESULT__`.
 *
 * If the code cannot be parsed the original source is returned untouched.
 */
export function transformCode(code: string): string {
  let ast: ReturnType<typeof parse>
  const comments: CommentInfo[] = []
  try {
    ast = parse(code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true,
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true,
      onComment: (
        _block: boolean,
        text: string,
        start: number,
        _end: number,
        startLoc?: { line: number }
      ) => {
        comments.push({ start, line: startLoc?.line ?? 0, text })
      }
    })
  } catch {
    return code
  }

  const body = (ast as unknown as { body: ExprNode[] }).body
  const replaced: Replacement[] = []
  const magicStarts = new Set<number>()

  const magicComments = comments.filter((c) => c.text.startsWith('?'))

  for (const comment of magicComments) {
    let target: ExprNode | undefined
    for (const node of body) {
      if (node.end <= comment.start && node.loc?.end.line === comment.line) {
        if (!target || target.end < node.end) target = node
      }
    }
    if (!target) continue

    let expr: ExprNode | undefined
    if (target.type === 'ExpressionStatement') expr = target.expression
    else if (target.type === 'VariableDeclaration') {
      const withInit = (target.declarations ?? []).filter((d) => d.init)
      expr = withInit.length ? withInit[withInit.length - 1].init : undefined
    }
    if (!expr) continue

    const exprSrc = code.slice(expr.start, expr.end)
    const custom = comment.text.slice(1).trim()
    // Only show a label when the magic comment has custom text.
    const labelArg = custom.length ? JSON.stringify(custom) : 'undefined'
    const logCall = `globalThis.__WISF_LOG__(( ${exprSrc} ), ${labelArg})`

    if (target.type === 'ExpressionStatement') {
      replaced.push({ start: target.start, end: target.end, code: logCall })
    } else {
      const original = code.slice(target.start, target.end)
      replaced.push({ start: target.start, end: target.end, code: `${original}; ${logCall}` })
    }
    magicStarts.add(target.start)
  }

  for (const node of body) {
    if (node.type !== 'ExpressionStatement' || !node.expression) continue
    if (magicStarts.has(node.start) || node.directive) continue
    const src = code.slice(node.expression.start, node.expression.end)
    // No label: only the resulting value is shown.
    replaced.push({
      start: node.start,
      end: node.end,
      code: `globalThis.__WISF_LOG__(( ${src} ), undefined, true)`
    })
  }

  const last = body[body.length - 1]
  if (last && last.type === 'VariableDeclaration' && !magicStarts.has(last.start)) {
    const withInit = (last.declarations ?? []).filter((d) => d.init)
    if (withInit.length) {
      const init = withInit[withInit.length - 1].init as ExprNode
      const src = code.slice(init.start, init.end)
      const original = code.slice(last.start, last.end)
      replaced.push({
        start: last.start,
        end: last.end,
        code: `${original}; globalThis.__WISF_RESULT__ = ( ${src} )`
      })
    }
  }

  if (replaced.length === 0) return code
  replaced.sort((a, b) => b.start - a.start)
  let out = code
  for (const r of replaced) {
    out = out.slice(0, r.start) + r.code + out.slice(r.end)
  }
  return out
}
