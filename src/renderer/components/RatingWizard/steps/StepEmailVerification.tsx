import React, { useState } from 'react'
import { motion } from 'framer-motion'

interface Props {
  email: string
  onEmailChange: (email: string) => void
  onSendCode: () => void
  onBack: () => void
  isSending?: boolean
  error?: string | null
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function StepEmailVerification({
  email,
  onEmailChange,
  onSendCode,
  onBack,
  isSending = false,
  error = null,
}: Props) {
  const [touched, setTouched] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)

  const validate = (): string | null => {
    if (!email.trim()) return 'E-Mail ist erforderlich'
    if (!EMAIL_REGEX.test(email)) return 'Bitte geben Sie eine gültige E-Mail-Adresse ein'
    return null
  }

  const handleBlur = () => {
    setTouched(true)
    setFieldError(validate())
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const err = validate()
    setTouched(true)
    setFieldError(err)
    if (!err) onSendCode()
  }

  const displayError = touched ? (fieldError || error) : error

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent/10 flex items-center justify-center">
          <svg className="w-8 h-8 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M22 7l-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-txt-primary">
          Bestätigen Sie Ihre E-Mail-Adresse
        </h2>
        <p className="text-base text-txt-body mt-1">
          Geben Sie Ihre E-Mail ein, um Ihre Bewertung zu verifizieren.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor="verification-email" className="block text-sm font-medium text-txt-body mb-1.5">
            E-Mail-Adresse <span className="text-status-error">*</span>
          </label>
          <input
            id="verification-email"
            type="email"
            value={email}
            onChange={(e) => {
              onEmailChange(e.target.value)
              if (touched) setFieldError(null)
            }}
            onBlur={handleBlur}
            placeholder="ihre@email.de"
            autoFocus
            aria-invalid={!!displayError}
            aria-describedby={displayError ? 'err-verification-email' : undefined}
            className={`
              w-full px-4 h-11 rounded-[10px] bg-surface-dark border text-[15px] text-txt-primary
              placeholder:text-txt-muted outline-none transition-all
              ${displayError
                ? 'border-status-error focus:border-status-error focus:ring-[3px] focus:ring-status-error/10'
                : 'border-border focus:border-accent focus:ring-[3px] focus:ring-accent/10'
              }
            `}
          />
          {displayError && (
            <motion.p
              id="err-verification-email"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-status-error mt-1"
              role="alert"
            >
              {displayError}
            </motion.p>
          )}
        </div>

        <div className="flex items-center justify-between pt-4">
          <button
            type="button"
            onClick={onBack}
            disabled={isSending}
            className="px-5 py-2.5 text-sm font-medium text-txt-secondary border border-border rounded-[10px] hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            Zurück
          </button>
          <motion.button
            type="submit"
            whileHover={!isSending ? { scale: 1.02 } : {}}
            whileTap={!isSending ? { scale: 0.98 } : {}}
            disabled={isSending}
            className="px-6 py-2.5 text-sm font-semibold text-white bg-accent hover:bg-accent-dark rounded-[10px] transition-all disabled:opacity-60 disabled:cursor-not-allowed min-w-[180px] h-[44px] flex items-center justify-center gap-2"
          >
            {isSending ? (
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full inline-block"
              />
            ) : (
              <>
                Code senden
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </>
            )}
          </motion.button>
        </div>
      </form>
    </div>
  )
}
