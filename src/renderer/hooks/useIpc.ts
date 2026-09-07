import type { OrchestratorApi } from '../../preload/preload'

declare global {
  interface Window {
    orchestrator: OrchestratorApi
  }
}

export function useIpc(): OrchestratorApi {
  if (!window.orchestrator) {
    console.error('Preload not loaded! window.orchestrator is undefined')
  }
  return window.orchestrator
}
