import type { JotterApi } from './index'

declare global {
  interface Window {
    jotter: JotterApi
  }
}

export {}
