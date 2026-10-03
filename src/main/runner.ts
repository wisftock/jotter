import { Executor, type ExecuteMessage } from './executor'

interface InitMessage {
  type: 'init'
  workspace: string
}

type Incoming = ExecuteMessage | InitMessage

const send = (message: unknown): void => {
  try {
    process.send?.(message)
  } catch {
    /* parent gone */
  }
}

const executor = new Executor(process.cwd(), send)

process.on('message', (raw: unknown) => {
  const message = raw as Incoming
  if (!message || typeof message !== 'object') return
  if (message.type === 'init') {
    executor.configure(message.workspace)
    send({ type: 'ready' })
    return
  }
  if (message.type === 'run') void executor.run(message)
})
