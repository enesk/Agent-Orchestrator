/// <reference types="vite/client" />
import type { IpcApi } from '@shared/ipc-contract'

declare global {
  interface Window {
    api: IpcApi
  }
}

export {}
