#!/usr/bin/env node
/**
 * End-to-end verification for a *built* JOTTER app (AppImage or linux-unpacked).
 *
 * It exercises the same code paths the app uses at runtime:
 *   - the Node runtime (fork of out/main/runner.js inside app.asar)
 *   - the Browser bundler (esbuild inside app.asar)
 *   - the bundled npm (install / uninstall / list)
 *
 * Usage:
 *   node scripts/verify-built-app.cjs [path-to-AppImage-or-unpacked-dir]
 *
 * With no argument it looks for the installed AppImage and then the local
 * release build. Exits non-zero if any case fails.
 */
const { execFileSync, spawn, fork } = require('child_process')
const {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync
} = require('fs')
const os = require('os')
const path = require('path')

const here = __dirname
const results = []

function record(name, ok, detail) {
  results.push({ name, ok, detail })
  const tag = ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'
  console.log(`[${tag}] ${name}${detail ? ` — ${detail}` : ''}`)
}

function findApp(arg) {
  const candidates = []
  if (arg) candidates.push(arg)
  candidates.push(path.join(os.homedir(), '.local/opt/jotter/JOTTER.AppImage'))
  candidates.push(path.join(here, '..', 'release', 'JOTTER-0.1.0.AppImage'))
  candidates.push(path.join(here, '..', 'release', 'linux-unpacked'))
  for (const c of candidates) {
    if (c && existsSync(c)) return c
  }
  throw new Error('No built app found. Pass the AppImage path as an argument.')
}

function resolveRoot(appPath, tmp) {
  if (existsSync(path.join(appPath, 'jotter'))) return appPath
  // It's an AppImage: extract it.
  try {
    execFileSync(appPath, ['--appimage-extract'], { cwd: tmp, stdio: 'ignore' })
  } catch {
    execFileSync('chmod', ['+x', appPath])
    execFileSync(appPath, ['--appimage-extract'], { cwd: tmp, stdio: 'ignore' })
  }
  const root = path.join(tmp, 'squashfs-root')
  if (!existsSync(path.join(root, 'jotter'))) {
    throw new Error('Extraction did not produce squashfs-root/jotter')
  }
  return root
}

function run(bin, args, opts = {}) {
  return spawn(bin, args, {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ...(opts.env || {}) },
    ...opts
  })
}

function nodeRuntimeTests(root, workspace) {
  return new Promise((resolve) => {
    const runnerPath = path.join(root, 'resources/app.asar/out/main/runner.js')
    const child = fork(runnerPath, [], {
      execPath: path.join(root, 'jotter'),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'ignore', 'pipe', 'ipc']
    })

    let stderr = ''
    child.stderr.on('data', (d) => (stderr += d.toString()))

    const cases = [
      ['node/js', 'javascript', 'const a = 2, b = 3\na * b', (t) => t === '6'],
      ['node/ts', 'typescript', 'const n: number = 41\nn + 1', (t) => t === '42'],
      ['node/jsx', 'jsx', 'const el = <h1 id="x">Hi</h1>\nel.type', (t) => t === 'h1'],
      ['node/tsx', 'tsx', 'const n: number = 7\nconst el = <p>{n}</p>\nel.type', (t) => t === 'p'],
      ['node/magic', 'javascript', '[1,2,3].map(n => n*2) //? doubled', (t) => t === '[ 2, 4, 6 ]'],
      ['node/require', 'javascript', "const u = require('uuid-noop')\nu(2)", (t) => t === '2'],
      ['node/import', 'javascript', "import { x } from 'esm-noop'\nx", (t) => t === 'esm-ok'],
      ['node/await', 'javascript', 'const v = await Promise.resolve(20)\nv + 1', (t) => t === '21'],
      ['node/console', 'javascript', "console.log('hi', 1)\n'end'", (t, logs) => logs[0] === 'hi 1']
    ]

    let idx = 0
    let current = null
    const pending = new Map()

    child.on('message', (msg) => {
      if (!msg || msg.type === 'ready') return
      const h = pending.get(current)
      if (h) h(msg)
    })

    function next() {
      if (idx >= cases.length) {
        child.kill()
        resolve()
        return
      }
      const [name, language, code, check] = cases[idx++]
      const id = `r${idx}`
      current = id
      const logs = []
      let runError = null
      pending.set(id, (msg) => {
        if (msg.type === 'log') logs.push({ text: msg.text, label: msg.label })
        else if (msg.type === 'error') runError = msg.error
        else if (msg.type === 'result') {
          pending.delete(id)
          const texts = logs.map((l) => l.text)
          const last = texts.at(-1)
          let ok = false
          try {
            ok = msg.ok && check(last, texts, logs)
          } catch {
            ok = false
          }
          const detail = runError
            ? `${runError.name}: ${String(runError.message).split('\n')[0]}`
            : `got ${JSON.stringify(last)}`
          record(name, ok, detail)
          next()
        }
      })
      child.send({ type: 'run', id, code, language })
    }

    child.on('message', (m) => {
      if (m && m.type === 'ready') next()
    })
    child.send({ type: 'init', workspace })

    setTimeout(() => {
      if (results.length === 0) {
        record('node runtime', false, 'timeout. stderr: ' + stderr.slice(0, 300))
        child.kill()
        resolve()
      }
    }, 30000)
  })
}

function bundlerTests(root, workspace, tmp) {
  return new Promise((resolve) => {
    const childFile = path.join(tmp, 'child-bundle.cjs')
    writeFileSync(
      childFile,
      `
const { createRequire } = require('module')
const path = require('path')
const fs = require('fs')
const ROOT = process.argv[2]
const workspace = process.argv[3]
const req = createRequire(path.join(ROOT, 'resources/app.asar/out/main/index.js'))
const pkg = '@esbuild/' + process.platform + '-' + process.arch
const subpath = process.platform === 'win32' ? 'esbuild.exe' : 'bin/esbuild'
let bin = req.resolve(pkg + '/' + subpath)
if (bin.includes('app.asar')) {
  const u = bin.replace('app.asar', 'app.asar.unpacked')
  if (fs.existsSync(u)) bin = u
}
process.env.ESBUILD_BINARY_PATH = bin
const esbuild = req('esbuild')
const { transform } = req('sucrase')
function transpile(code, language) {
  const transforms = []
  if (language === 'typescript' || language === 'tsx') transforms.push('typescript')
  if (language === 'jsx' || language === 'tsx') transforms.push('jsx')
  return transform(code, { transforms, disableESTransforms: true, jsxRuntime: 'automatic', production: false }).code
}
async function bundle(code, language) {
  const js = transpile(code, language)
  const r = await esbuild.build({
    stdin: { contents: js, resolveDir: workspace, sourcefile: 'snippet.js', loader: 'js' },
    bundle: true, platform: 'browser', format: 'iife', target: 'es2020',
    write: false, logLevel: 'silent', jsx: 'automatic', jsxImportSource: 'react'
  })
  return r.outputFiles[0].text.length
}
const cases = [
  ['browser/js', 'javascript', 'console.log(1+1)', 0],
  ['browser/ts', 'typescript', 'const n: number = 2\\nconsole.log(n)', 0],
  ['browser/jsx', 'jsx', 'const el = <h1>Hi</h1>\\nconsole.log(el)', 0],
  ['browser/tsx', 'tsx', 'const n: number = 1\\nconst el = <p>{n}</p>\\nconsole.log(el)', 0],
  ['browser/react-dom', 'tsx', 'import { createRoot } from "react-dom/client"\\ncreateRoot(document.getElementById("root")).render(<h1>x</h1>)', 0]
]
;(async () => {
  const out = []
  for (const [name, lang, code] of cases) {
    try { const bytes = await bundle(code, lang); out.push({ name, ok: true, detail: bytes + ' bytes' }) }
    catch (e) { out.push({ name, ok: false, detail: String(e.message).split('\\n')[0] }) }
  }
  process.stdout.write('JOTTER_BUNDLE_RESULT:' + JSON.stringify(out))
})().catch((e) => { process.stdout.write('JOTTER_BUNDLE_RESULT:' + JSON.stringify([{ name: 'browser', ok: false, detail: e.message }])) })
`
    )

    const child = run(path.join(root, 'jotter'), [childFile, root, workspace])
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d.toString()))
    child.stderr.on('data', (d) => (err += d.toString()))
    child.on('close', () => {
      const marker = out.indexOf('JOTTER_BUNDLE_RESULT:')
      if (marker === -1) {
        record('browser bundler', false, 'no result. ' + err.slice(0, 300))
        resolve()
        return
      }
      try {
        const parsed = JSON.parse(out.slice(marker + 'JOTTER_BUNDLE_RESULT:'.length))
        for (const c of parsed) record(c.name, c.ok, c.detail)
      } catch (e) {
        record('browser bundler', false, 'bad output: ' + out.slice(0, 200))
      }
      resolve()
    })
  })
}

function npmTests(root, tmp) {
  return new Promise((resolve) => {
    const ws = path.join(tmp, 'npm-ws')
    const dep = path.join(tmp, 'local-dep')
    mkdirSync(path.join(ws), { recursive: true })
    mkdirSync(dep, { recursive: true })
    writeFileSync(path.join(ws, 'package.json'), JSON.stringify({ name: 'ws', private: true, type: 'module' }))
    writeFileSync(
      path.join(dep, 'package.json'),
      JSON.stringify({ name: 'verify-dep', version: '1.0.0', main: 'index.js' })
    )
    writeFileSync(path.join(dep, 'index.js'), 'module.exports = 1')

    const npmCli = path.join(root, 'resources/app.asar.unpacked/node_modules/npm/bin/npm-cli.js')
    const bin = path.join(root, 'jotter')

    function npm(args) {
      return new Promise((res) => {
        const c = run(bin, [npmCli, ...args], { cwd: ws })
        let err = ''
        c.stderr.on('data', (d) => (err += d.toString()))
        c.stdout.on('data', () => undefined)
        c.on('close', (code) => res({ code, err }))
      })
    }

    ;(async () => {
      const install = await npm(['install', '--no-audit', '--no-fund', '--color=never', dep])
      const installed = existsSync(path.join(ws, 'node_modules', 'verify-dep'))
      record('npm/install', install.code === 0 && installed, install.code === 0 ? 'ok' : install.err.slice(0, 200))

      const pkg = JSON.parse(require('fs').readFileSync(path.join(ws, 'package.json'), 'utf8'))
      const listed = Object.keys(pkg.dependencies || {}).includes('verify-dep')
      record('npm/list', listed, listed ? 'ok' : 'dependency not in package.json')

      const uninstall = await npm(['uninstall', '--no-audit', '--no-fund', '--color=never', 'verify-dep'])
      const removed = !existsSync(path.join(ws, 'node_modules', 'verify-dep'))
      record('npm/uninstall', uninstall.code === 0 && removed, removed ? 'ok' : uninstall.err.slice(0, 200))
      resolve()
    })()
  })
}

function seedWorkspace(workspace) {
  mkdirSync(path.join(workspace, 'node_modules', 'react'), { recursive: true })
  writeFileSync(
    path.join(workspace, 'node_modules', 'react', 'package.json'),
    JSON.stringify({
      name: 'react',
      version: '1.0.0',
      main: 'index.js',
      exports: {
        '.': './index.js',
        './jsx-runtime': './jsx-runtime.js',
        './jsx-dev-runtime': './jsx-dev-runtime.js'
      }
    })
  )
  writeFileSync(
    path.join(workspace, 'node_modules', 'react', 'jsx-runtime.js'),
    'exports.jsx = (type, props) => ({ type, props })\n' +
      'exports.jsxs = (type, props) => ({ type, props })\n'
  )
  writeFileSync(
    path.join(workspace, 'node_modules', 'react', 'jsx-dev-runtime.js'),
    'exports.jsxDEV = (type, props) => ({ type, props })\n'
  )
  mkdirSync(path.join(workspace, 'node_modules', 'react-dom'), { recursive: true })
  writeFileSync(
    path.join(workspace, 'node_modules', 'react-dom', 'package.json'),
    JSON.stringify({
      name: 'react-dom',
      version: '1.0.0',
      main: 'index.js',
      exports: { '.': './index.js', './client': './client.js' }
    })
  )
  writeFileSync(path.join(workspace, 'node_modules', 'react-dom', 'index.js'), 'exports.ok = true')
  writeFileSync(
    path.join(workspace, 'node_modules', 'react-dom', 'client.js'),
    'exports.createRoot = () => ({ render: () => undefined })'
  )
  mkdirSync(path.join(workspace, 'node_modules', 'uuid-noop'), { recursive: true })
  writeFileSync(
    path.join(workspace, 'node_modules', 'uuid-noop', 'package.json'),
    JSON.stringify({ name: 'uuid-noop', version: '1.0.0', main: 'index.js' })
  )
  writeFileSync(path.join(workspace, 'node_modules', 'uuid-noop', 'index.js'), 'module.exports = (n) => n')
  mkdirSync(path.join(workspace, 'node_modules', 'esm-noop'), { recursive: true })
  writeFileSync(
    path.join(workspace, 'node_modules', 'esm-noop', 'package.json'),
    JSON.stringify({ name: 'esm-noop', version: '1.0.0', type: 'module', main: 'index.js' })
  )
  writeFileSync(path.join(workspace, 'node_modules', 'esm-noop', 'index.js'), 'export const x = "esm-ok"')
}

async function main() {
  const appPath = path.resolve(findApp(process.argv[2]))
  console.log(`Verifying app: ${appPath}\n`)
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'jotter-verify-'))
  try {
    const root = resolveRoot(appPath, tmp)
    const workspace = path.join(tmp, 'workspace')
    mkdirSync(workspace, { recursive: true })
    writeFileSync(path.join(workspace, 'package.json'), JSON.stringify({ name: 'ws', private: true, type: 'module' }))
    seedWorkspace(workspace)

    console.log('— Node runtime (fork del runner dentro del asar)')
    await nodeRuntimeTests(root, workspace)

    console.log('\n— Browser bundler (esbuild dentro del asar)')
    await bundlerTests(root, workspace, tmp)

    console.log('\n— npm del paquete')
    await npmTests(root, tmp)
  } catch (e) {
    record('setup', false, e.message)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  if (failed.length) {
    console.log('\nFallaron:')
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`)
  }
  process.exit(failed.length ? 1 : 0)
}

main()
