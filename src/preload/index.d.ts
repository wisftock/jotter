import type { WisfJsApi } from './index'

declare global {
  interface Window {
    wisfjs: WisfJsApi
  }
}

export {}
