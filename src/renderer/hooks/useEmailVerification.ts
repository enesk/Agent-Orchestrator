import { useState, useCallback } from 'react'
import { useIpc } from './useIpc'

export function useEmailVerification() {
  const ipc = useIpc()
  const [verificationId, setVerificationId] = useState<string | null>(null)
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sendCode = useCallback(async (email: string) => {
    setIsSending(true)
    setError(null)
    try {
      const result = await ipc.emailVerification.sendCode(email)
      if (!result.success) {
        setError(result.error || 'Fehler beim Senden des Codes')
        return false
      }
      setVerificationId(result.verificationId!)
      return true
    } catch {
      setError('Fehler beim Senden des Codes')
      return false
    } finally {
      setIsSending(false)
    }
  }, [ipc])

  const verifyCode = useCallback(async (code: string) => {
    if (!verificationId) {
      setError('Keine aktive Verifizierung')
      return false
    }
    setIsVerifying(true)
    setError(null)
    try {
      const result = await ipc.emailVerification.verifyCode(verificationId, code)
      if (!result.success) {
        setError(result.error || 'Verifizierung fehlgeschlagen')
        return false
      }
      setVerifiedEmail(result.email!)
      return true
    } catch {
      setError('Verifizierung fehlgeschlagen')
      return false
    } finally {
      setIsVerifying(false)
    }
  }, [ipc, verificationId])

  const resendCode = useCallback(async () => {
    if (!verificationId) return false
    setError(null)
    try {
      const result = await ipc.emailVerification.resendCode(verificationId)
      if (!result.success) {
        setError(result.error || 'Fehler beim erneuten Senden')
        return false
      }
      return true
    } catch {
      setError('Fehler beim erneuten Senden')
      return false
    }
  }, [ipc, verificationId])

  const reset = useCallback(() => {
    setVerificationId(null)
    setVerifiedEmail(null)
    setError(null)
  }, [])

  return {
    verificationId,
    verifiedEmail,
    isSending,
    isVerifying,
    error,
    sendCode,
    verifyCode,
    resendCode,
    reset,
  }
}
