#!/usr/bin/env node
/**
 * End-to-end GUI test for the Browser environment + Web View.
 *
 * Launches the built app with the DevTools protocol, injects a TSX + Browser
 * snippet through the real snippets store, runs it, and reads the rendered
 * result from the sandboxed iframe (which is an out-of-process target).
 *
 * Requires a display (this drives the real Electron window). Usage:
 *   node scripts/gui-browser-e2e.cjs [path-to-app-binary-or-unpacked-dir]
 *
 * Exits non-zero if the Web View does not render the React output.
 */
const { spawn, execFileSync } = require('child_process')
const { existsSync, mkdtempSync, rmSync } = require('fs')
const os = require('os')
const path = require('path')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function findApp(arg) {
  const candidates = []
  if (arg) candidates.push(arg)
  candidates.push(path.join(os.homedir(), '.local/opt/jotter/JOTTER.AppImage'))
  candidates.push(path.resolve(__dirname, '..', 'release', 'linux-unpacked'))
  for (const c of candidates) if (c && existsSync(c)) return c
  throw new Error('No built app found. Pass a path as an argument.')
}

function resolveBinary(appPath, tmp) {
  if (existsSync(path.join(appPath, 'jotter'))) return path.join(appPath, 'jotter')
  try {
    execFileSync(appPath, ['--appimage-extract'], { cwd: tmp, stdio: 'ignore' })
  } catch {
    execFileSync('chmod', ['+x', appPath])
    execFileSync(appPath, ['--appimage-extract'], { cwd: tmp, stdio: 'ignore' })
  }
  return path.join(tmp, 'squashfs-root', 'jotter')
}

class CDP {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(JSON.stringify(msg.error)))
        else resolve(msg.result)
      }
    }
  }
  send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++this.id
      this.pending.set(id, { resolve, reject })
      const msg = { id, method, params }
      if (sessionId) msg.sessionId = sessionId
      this.ws.send(JSON.stringify(msg))
    })
  }
  async eval(expression, opts = {}) {
    const params = { expression, awaitPromise: true, returnByValue: true, userGesture: true }
    if (opts.contextId) params.contextId = opts.contextId
    const r = await this.send('Runtime.evaluate', params, opts.sessionId)
    if (r.exceptionDetails) {
      return { exception: r.exceptionDetails.exception?.description || r.exceptionDetails.text }
    }
    return { value: r.result?.value }
  }
}

const SNIPPET = `import { createRoot } from "react-dom/client"

function App() {
  return <h1 id="hello">Hola desde JOTTER</h1>
}

createRoot(document.getElementById("root")!).render(<App />)`

async function readWebView(cdp) {
  const tg = await cdp.send('Target.getTargets')
  const iframe = tg.targetInfos.find((t) => t.type === 'iframe')
  if (!iframe) return ''
  let sessionId
  try {
    const attached = await cdp.send('Target.attachToTarget', {
      targetId: iframe.targetId,
      flatten: true
    })
    sessionId = attached.sessionId
    await cdp.send('Runtime.enable', {}, sessionId)
    const r = await cdp.eval(
      '(() => { const el = document.getElementById("root") || document.body; return el ? el.innerHTML : "" })()',
      { sessionId }
    )
    return typeof r.value === 'string' ? r.value : ''
  } catch {
    return ''
  } finally {
    if (sessionId) {
      try {
        await cdp.send('Target.detachFromTarget', { sessionId })
      } catch {}
    }
  }
}

async function main() {
  const appPath = path.resolve(findApp(process.argv[2]))
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'jotter-gui-'))
  const bin = resolveBinary(appPath, tmp)
  console.log(`Launching: ${bin}`)

  const app = spawn(bin, ['--remote-debugging-port=9222', '--no-sandbox'], {
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let appLog = ''
  app.stdout.on('data', (d) => (appLog += d.toString()))
  app.stderr.on('data', (d) => (appLog += d.toString()))

  let pass = false
  let ws
  try {
    let target = null
    for (let i = 0; i < 60 && !target; i++) {
      await sleep(500)
      try {
        const res = await fetch('http://127.0.0.1:9222/json')
        target = (await res.json()).find((t) => t.type === 'page')
      } catch {}
    }
    if (!target) throw new Error('No page target. ' + appLog.slice(0, 500))

    ws = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((res, rej) => {
      ws.onopen = res
      ws.onerror = rej
    })
    const cdp = new CDP(ws)
    await cdp.send('Runtime.enable')
    await cdp.send('Page.enable')

    for (let i = 0; i < 40; i++) {
      const r = await cdp.eval('!!document.querySelector(".monaco-editor") && typeof window.jotter === "object"')
      if (r.value) break
      await sleep(500)
    }

    const now = Date.now()
    const snippet = {
      id: 'e2e-webtest',
      name: 'e2e-webtest',
      code: SNIPPET,
      language: 'tsx',
      env: 'browser',
      createdAt: now,
      updatedAt: now
    }
    await cdp.eval(`window.jotter.snippets.save(${JSON.stringify(snippet)})`)
    await cdp.send('Page.reload')
    await sleep(1500)
    for (let i = 0; i < 40; i++) {
      const r = await cdp.eval('!!document.querySelector(".monaco-editor") && typeof window.jotter === "object"')
      if (r.value) break
      await sleep(500)
    }

    await cdp.eval(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Snippets')?.click()`)
    await sleep(600)
    await cdp.eval(`[...document.querySelectorAll('.snippet-open')].find(b => b.textContent.includes('e2e-webtest'))?.click()`)
    await sleep(600)
    await cdp.eval(`document.querySelectorAll('.autorun input[type=checkbox]')[1]?.click()`)
    await sleep(300)
    await cdp.eval(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Run'))?.click()`)

    let html = ''
    for (let i = 0; i < 40; i++) {
      await sleep(500)
      html = await readWebView(cdp)
      if (html.includes('Hola desde JOTTER')) break
    }

    pass = html.includes('Hola desde JOTTER')
    console.log('WebView #root.innerHTML:', html ? html.slice(0, 160) : '(empty)')
    await cdp.eval(`window.jotter.snippets.remove('e2e-webtest')`).catch(() => {})
  } catch (e) {
    console.error('ERROR:', e.message)
  } finally {
    if (ws) ws.close()
    app.kill('SIGKILL')
    rmSync(tmp, { recursive: true, force: true })
  }

  console.log(pass ? '\nPASS: React WebView rendered in Browser environment' : '\nFAIL: WebView did not render')
  setTimeout(() => process.exit(pass ? 0 : 1), 300)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
