import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface Props {
  isOpen: boolean
  onVerify: (code: string) => void
  onResendCode: () => void
  onClose: () => void
  isVerifying?: boolean
  error?: string | null
}

const CODE_LENGTH = 6
const MAX_RESENDS = 3
const COOLDOWN_SECONDS = 60

export default function StepVerificationModal({
  isOpen,
  onVerify,
  onResendCode,
  onClose,
  isVerifying = false,
  error = null,
}: Props) {
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''))
  const [resendCount, setResendCount] = useState(0)
  const [cooldown, setCooldown] = useState(0)
  const [verified, setVerified] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const allFilled = digits.every((d) => d !== '')

  useEffect(() => {
    if (isOpen && inputRefs.current[0]) {
      inputRefs.current[0]?.focus()
    }
  }, [isOpen])

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  useEffect(() => {
    if (!isOpen) {
      setDigits(Array(CODE_LENGTH).fill(''))
      setVerified(false)
    }
  }, [isOpen])

  const focusInput = (index: number) => {
    if (index >= 0 && index < CODE_LENGTH) {
      inputRefs.current[index]?.focus()
      inputRefs.current[index]?.select()
    }
  }

  const handleChange = (index: number, val: string) => {
    const digit = val.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[index] = digit
    setDigits(next)
    if (digit && index < CODE_LENGTH - 1) {
      focusInput(index + 1)
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        e.preventDefault()
        const next = [...digits]
        next[index - 1] = ''
        setDigits(next)
        focusInput(index - 1)
      }
    } else if (e.key === 'ArrowLeft') {
      focusInput(index - 1)
    } else if (e.key === 'ArrowRight') {
      focusInput(index + 1)
    }
  }

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH)
    if (!pasted) return
    const next = [...digits]
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i]
    }
    setDigits(next)
    focusInput(Math.min(pasted.length, CODE_LENGTH - 1))
  }, [digits])

  const handleVerify = () => {
    if (!allFilled || isVerifying) return
    onVerify(digits.join(''))
  }

  const handleResend = () => {
    if (resendCount >= MAX_RESENDS || cooldown > 0) return
    onResendCode()
    setResendCount((c) => c + 1)
    setCooldown(COOLDOWN_SECONDS)
    setDigits(Array(CODE_LENGTH).fill(''))
    focusInput(0)
  }

  const canResend = resendCount < MAX_RESENDS && cooldown === 0

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="verification-title"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] bg-white mx-4"
        style={{ borderRadius: '20px', padding: '32px', boxShadow: '0 24px 48px rgba(0,0,0,0.12)' }}
      >
        <AnimatePresence mode="wait">
          {verified ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-4"
            >
              <div className="w-16 h-16 mx-auto rounded-full bg-status-success/10 flex items-center justify-center">
                <motion.svg
                  initial={{ scale: 0, rotate: -45 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: 0.15, type: 'spring', stiffness: 200 }}
                  className="w-8 h-8 text-status-success"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 13l4 4L19 7" />
                </motion.svg>
              </div>
              <h3 className="text-xl font-semibold text-txt-primary">Bewertung veröffentlicht!</h3>
              <p className="text-sm text-txt-body">
                Ihre Bewertung wurde erfolgreich verifiziert und ist ab sofort sichtbar.
              </p>
              <div className="pt-2 border-t border-border mt-4">
                <p className="text-sm text-txt-secondary">
                  Möchten Sie ein Konto erstellen, um Ihre Bewertungen zu verwalten?
                </p>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="mt-3 w-full h-11 rounded-[10px] bg-accent hover:bg-accent-dark text-white text-sm font-semibold transition-colors"
                >
                  Konto erstellen
                </motion.button>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-2 w-full text-sm text-txt-secondary hover:text-txt-primary transition-colors py-2"
                >
                  Nein danke
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="form" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <h3 id="verification-title" className="text-[22px] font-bold text-txt-primary mb-2 text-center">
                Verifizierungscode eingeben
              </h3>
              <p className="text-[15px] text-txt-secondary mb-6 text-center">
                Wir haben Ihnen einen 4-stelligen Code per E-Mail gesendet.
              </p>

              <div className="flex justify-center gap-3 mb-4">
                {digits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    onPaste={i === 0 ? handlePaste : undefined}
                    onFocus={(e) => e.target.select()}
                    aria-label={`Ziffer ${i + 1} von ${CODE_LENGTH}`}
                    className={`
                      w-14 h-14 text-center text-2xl font-bold rounded-xl border-2 bg-surface-dark
                      outline-none transition-all text-txt-primary
                      ${error
                        ? 'border-status-error focus:border-status-error focus:ring-[3px] focus:ring-status-error/10'
                        : 'border-border focus:border-accent focus:ring-[3px] focus:ring-accent/10'
                      }
                    `}
                  />
                ))}
              </div>

              <AnimatePresence>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-xs text-status-error text-center mb-4"
                    role="alert"
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              <motion.button
                type="button"
                whileHover={allFilled && !isVerifying ? { scale: 1.02 } : {}}
                whileTap={allFilled && !isVerifying ? { scale: 0.98 } : {}}
                onClick={handleVerify}
                disabled={!allFilled || isVerifying}
                className="w-full h-11 rounded-[10px] bg-accent hover:bg-accent-dark text-white text-[15px] font-semibold disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center"
              >
                {isVerifying ? (
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full inline-block"
                  />
                ) : (
                  'Bestätigen'
                )}
              </motion.button>

              <div className="text-center mt-4">
                {canResend ? (
                  <button
                    type="button"
                    onClick={handleResend}
                    className="text-sm text-accent hover:text-accent-dark underline underline-offset-2 transition-colors"
                  >
                    Neuen Code senden
                  </button>
                ) : cooldown > 0 ? (
                  <span className="text-sm text-txt-muted">
                    Neuen Code senden in {cooldown}s
                  </span>
                ) : (
                  <span className="text-sm text-txt-muted">
                    Maximale Anzahl erreicht ({MAX_RESENDS}/{MAX_RESENDS})
                  </span>
                )}
                {resendCount > 0 && resendCount < MAX_RESENDS && (
                  <span className="block text-xs text-txt-muted mt-1">
                    {MAX_RESENDS - resendCount} Versuch(e) verbleibend
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full mt-4 text-sm text-txt-secondary hover:text-txt-primary transition-colors text-center"
              >
                Abbrechen
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
