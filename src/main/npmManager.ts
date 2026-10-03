import { spawn, type ChildProcess } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createRequire } from 'node:module'
import type { NpmPackage, NpmProgress } from '../shared/types'

type ProgressHandler = (progress: NpmProgress) => void

interface NpmCommand {
  command: string
  baseArgs: string[]
  shell: boolean
}

/**
 * Manages npm packages inside a local workspace.
 *
 * The npm CLI shipped with the app is preferred so end users do not need a
 * standalone Node.js installation. It is executed with the Electron binary in
 * Node mode (ELECTRON_RUN_AS_NODE). A system npm is used as a fallback.
 */
export class NpmManager {
  private readonly workspace: string
  private readonly packageJson: string
  private running: ChildProcess | null = null
  private command: NpmCommand | null = null

  constructor(workspace: string) {
    this.workspace = workspace
    this.packageJson = join(workspace, 'package.json')
  }

  private resolveCommand(): NpmCommand {
    if (this.command) return this.command
    try {
      const require_ = createRequire(__filename)
      let manifest = require_.resolve('npm/package.json')
      if (manifest.includes('app.asar')) {
        const unpacked = manifest.replace('app.asar', 'app.asar.unpacked')
        if (existsSync(unpacked)) manifest = unpacked
      }
      const cli = join(dirname(manifest), 'bin', 'npm-cli.js')
      if (existsSync(cli)) {
        this.command = { command: process.execPath, baseArgs: [cli], shell: false }
        return this.command
      }
    } catch {
      /* fall through to system npm */
    }
    this.command = {
      command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
      baseArgs: [],
      shell: process.platform === 'win32'
    }
    return this.command
  }

  private run(args: string[], onProgress: ProgressHandler): Promise<number> {
    if (this.running) {
      onProgress({ stream: 'stderr', data: 'Another npm task is already running.\n' })
      return Promise.resolve(1)
    }
    const npm = this.resolveCommand()
    return new Promise((resolve) => {
      const child = spawn(npm.command, [...npm.baseArgs, ...args], {
        cwd: this.workspace,
        shell: npm.shell,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
          NO_UPDATE_NOTIFIER: '1',
          NPM_CONFIG_UPDATE_NOTIFIER: 'false',
          NPM_CONFIG_FUND: 'false',
          NPM_CONFIG_AUDIT: 'false',
          NPM_CONFIG_COLOR: 'never'
        }
      })
      this.running = child
      child.stdout?.on('data', (chunk: Buffer) =>
        onProgress({ stream: 'stdout', data: chunk.toString() })
      )
      child.stderr?.on('data', (chunk: Buffer) =>
        onProgress({ stream: 'stderr', data: chunk.toString() })
      )
      child.on('error', (err) => {
        onProgress({ stream: 'stderr', data: `\n${err.message}\n` })
      })
      child.on('close', (code) => {
        this.running = null
        resolve(code ?? 0)
      })
    })
  }

  install(packages: string[], onProgress: ProgressHandler): Promise<number> {
    return this.run(['install', '--no-audit', '--no-fund', '--color=never', ...packages], onProgress)
  }

  uninstall(packages: string[], onProgress: ProgressHandler): Promise<number> {
    return this.run(
      ['uninstall', '--no-audit', '--no-fund', '--color=never', ...packages],
      onProgress
    )
  }

  list(): NpmPackage[] {
    try {
      if (!existsSync(this.packageJson)) return []
      const pkg = JSON.parse(readFileSync(this.packageJson, 'utf8')) as {
        dependencies?: Record<string, string>
      }
      const deps = pkg.dependencies ?? {}
      return Object.keys(deps)
        .sort()
        .map((name) => {
          const installed = this.installedVersion(name)
          return { name, version: installed ?? deps[name] }
        })
    } catch {
      return []
    }
  }

  private installedVersion(name: string): string | null {
    try {
      const manifest = join(this.workspace, 'node_modules', name, 'package.json')
      if (!existsSync(manifest)) return null
      const pkg = JSON.parse(readFileSync(manifest, 'utf8')) as { version?: string }
      return pkg.version ?? null
    } catch {
      return null
    }
  }
}
