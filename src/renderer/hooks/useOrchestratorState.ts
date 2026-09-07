import { useState, useEffect, useCallback } from 'react'
import { OrchestratorState, LogEntry } from '@shared/types'
import { useIpc } from './useIpc'

const MAX_VISIBLE_LOGS = 100

const initialState: OrchestratorState = {
  connected: false,
  claudeRunning: false,
  activeSessions: 0,
  userToken: null,
  backendUrl: null,
  userEmail: null,
  planName: null,
  lastConnectedAt: null,
  version: '1.0.0',
}

export function useOrchestratorState() {
  const ipc = useIpc()
  const [state, setState] = useState<OrchestratorState>(initialState)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([ipc.getState(), ipc.getLogs()])
      .then(([s, l]) => {
        setState(s)
        setLogs(l.slice(-MAX_VISIBLE_LOGS))
        setLoading(false)
      })
      .catch((err) => {
        setError(String(err))
        setLoading(false)
      })

    const unsubState = ipc.onStateUpdate((newState) => {
      setState(newState)
    })

    const unsubLog = ipc.onLogUpdate((entry) => {
      setLogs((prev) => [...prev.slice(-(MAX_VISIBLE_LOGS - 1)), entry])
    })

    return () => {
      unsubState()
      unsubLog()
    }
  }, [])

  const connect = useCallback(async (url: string, token: string) => {
    setError(null)
    try {
      await ipc.connect(url, token)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      throw err
    }
  }, [ipc])

  const disconnect = useCallback(async () => {
    setError(null)
    await ipc.disconnect()
  }, [ipc])

  const clearLogs = useCallback(() => {
    setLogs([])
  }, [])

  const minimizeToTray = useCallback(() => {
    ipc.minimizeToTray()
  }, [ipc])

  return { state, logs, loading, error, connect, disconnect, clearLogs, minimizeToTray }
}
