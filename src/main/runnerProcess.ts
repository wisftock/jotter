import { fork, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import type { RunParams } from '../shared/types'

/**
 * Owns a persistent Node.js child process that evaluates user snippets.
 * The child is the Electron binary running with ELECTRON_RUN_AS_NODE=1 so no
 * separate Node installation is required at runtime.
 */
export class NodeRunner extends EventEmitter {
  private child: ChildProcess | null = null
  private readonly workspace: string

  constructor(workspace: string) {
    super()
    this.workspace = workspace
  }

  start(): void {
    if (this.child) return
    const runnerPath = join(__dirname, 'runner.js')
    this.child = fork(runnerPath, [], {
      execPath: process.execPath,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc']
    })
    this.child.on('message', (message: unknown) => this.emit('message', message))
    this.child.on('exit', () => {
      this.child = null
    })
    this.child.send({ type: 'init', workspace: this.workspace })
  }

  run(params: RunParams): void {
    this.start()
    this.child?.send({ type: 'run', ...params })
  }

  dispose(): void {
    this.child?.kill()
    this.child = null
  }
}
