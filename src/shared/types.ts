export type RunEnv = 'node' | 'browser'

export type Language = 'javascript' | 'typescript' | 'jsx' | 'tsx'

export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug' | 'result'

export interface RunnerLog {
  level: LogLevel
  /** Human readable, already formatted text. */
  text: string
  /** The source expression for magic-comment logs, when available. */
  label?: string
  /** Identifier of the run that produced this entry, used to drop stale output. */
  runId?: string
  /** Bare package name that could not be resolved, if any. */
  package?: string
}

export interface LogEntry extends RunnerLog {
  id: string
  /** milliseconds since the epoch */
  time: number
}

export interface RunError {
  name: string
  message: string
  stack?: string
  /** Identifier of the run that failed, used to route output to a tab. */
  runId?: string
  /** Bare package name that could not be resolved, if any. */
  package?: string
}

export interface WorkTab {
  id: string
  name: string
  code: string
  language: Language
  env: RunEnv
}

export interface RunResult {
  id: string
  ok: boolean
  duration: number
  error?: RunError
}

export interface Snippet {
  id: string
  name: string
  code: string
  language: Language
  env: RunEnv
  createdAt: number
  updatedAt: number
}

export interface BundleError {
  name: string
  message: string
  stack?: string
  package?: string
}

export interface BundleResult {
  ok: boolean
  code?: string
  error?: BundleError
}

export interface NpmPackage {
  name: string
  version: string
}

export interface NpmProgress {
  stream: 'stdout' | 'stderr'
  data: string
}

export interface RunParams {
  id: string
  code: string
  language: Language
  env: RunEnv
}
