import React, { useState } from 'react'
import { motion } from 'framer-motion'

interface SubmitData {
  firstName: string
  email: string
  consent: boolean
}

interface Props {
  value: SubmitData
  onChange: (data: SubmitData) => void
  onSubmit: () => void
  onBack: () => void
  isSubmitting?: boolean
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface FieldErrors {
  firstName?: string
  email?: string
  consent?: string
}

export default function StepSubmit({ value, onChange, onSubmit, onBack, isSubmitting = false }: Props) {
  const [errors, setErrors] = useState<FieldErrors>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const validate = (): FieldErrors => {
    const errs: FieldErrors = {}
    if (!value.firstName.trim()) errs.firstName = 'Vorname ist erforderlich'
    if (!value.email.trim()) {
      errs.email = 'E-Mail ist erforderlich'
    } else if (!EMAIL_REGEX.test(value.email)) {
      errs.email = 'Bitte geben Sie eine gültige E-Mail-Adresse ein'
    }
    if (!value.consent) errs.consent = 'Sie müssen den Bedingungen zustimmen'
    return errs
  }

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }))
    setErrors(validate())
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate()
    setErrors(errs)
    setTouched({ firstName: true, email: true, consent: true })
    if (Object.keys(errs).length === 0) onSubmit()
  }

  const showError = (field: keyof FieldErrors) => touched[field] && errors[field]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-txt-primary">Fast geschafft!</h2>
        <p className="text-base text-txt-body mt-1">
          Geben Sie Ihren Namen und Ihre E-Mail-Adresse an, um die Bewertung abzusenden.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor="submit-firstname" className="block text-sm font-medium text-txt-body mb-1.5">
            Vorname <span className="text-status-error">*</span>
          </label>
          <input
            id="submit-firstname"
            type="text"
            value={value.firstName}
            onChange={(e) => onChange({ ...value, firstName: e.target.value })}
            onBlur={() => handleBlur('firstName')}
            placeholder="Ihr Vorname"
            aria-invalid={!!showError('firstName')}
            aria-describedby={showError('firstName') ? 'err-firstname' : undefined}
            className={`
              w-full px-4 h-11 rounded-[10px] bg-surface-dark border text-[15px] text-txt-primary
              placeholder:text-txt-muted outline-none transition-all
              ${showError('firstName')
                ? 'border-status-error focus:border-status-error focus:ring-[3px] focus:ring-status-error/10'
                : 'border-border focus:border-accent focus:ring-[3px] focus:ring-accent/10'
              }
            `}
          />
          {showError('firstName') && (
            <motion.p id="err-firstname" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-status-error mt-1" role="alert">
              {errors.firstName}
            </motion.p>
          )}
        </div>

        <div>
          <label htmlFor="submit-email" className="block text-sm font-medium text-txt-body mb-1.5">
            E-Mail-Adresse <span className="text-status-error">*</span>
          </label>
          <input
            id="submit-email"
            type="email"
            value={value.email}
            onChange={(e) => onChange({ ...value, email: e.target.value })}
            onBlur={() => handleBlur('email')}
            placeholder="ihre@email.de"
            aria-invalid={!!showError('email')}
            aria-describedby={showError('email') ? 'err-email' : undefined}
            className={`
              w-full px-4 h-11 rounded-[10px] bg-surface-dark border text-[15px] text-txt-primary
              placeholder:text-txt-muted outline-none transition-all
              ${showError('email')
                ? 'border-status-error focus:border-status-error focus:ring-[3px] focus:ring-status-error/10'
                : 'border-border focus:border-accent focus:ring-[3px] focus:ring-accent/10'
              }
            `}
          />
          {showError('email') && (
            <motion.p id="err-email" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-status-error mt-1" role="alert">
              {errors.email}
            </motion.p>
          )}
        </div>

        <div className="pt-2">
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="relative flex-shrink-0 mt-0.5">
              <input
                type="checkbox"
                checked={value.consent}
                onChange={(e) => {
                  onChange({ ...value, consent: e.target.checked })
                  if (touched.consent) setErrors(validate())
                }}
                onBlur={() => handleBlur('consent')}
                className="sr-only peer"
                aria-invalid={!!showError('consent')}
                aria-describedby={showError('consent') ? 'err-consent' : undefined}
              />
              <div className={`
                w-5 h-5 rounded-md border-2 transition-all flex items-center justify-center
                ${value.consent
                  ? 'bg-accent border-accent'
                  : showError('consent')
                    ? 'border-status-error bg-white'
                    : 'border-border bg-white group-hover:border-accent/40'
                }
              `}>
                {value.consent && (
                  <motion.svg
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.15 }}
                    className="w-3.5 h-3.5 text-white"
                    viewBox="0 0 14 14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2.5 7.5L5.5 10.5L11.5 3.5" />
                  </motion.svg>
                )}
              </div>
            </div>
            <span className="text-sm text-txt-body leading-snug">
              Ich bestätige, dass meine Bewertung auf einer echten Erfahrung basiert und stimme den{' '}
              <span className="text-accent hover:text-accent-dark underline underline-offset-2 cursor-pointer">
                Nutzungsbedingungen
              </span>{' '}
              sowie der{' '}
              <span className="text-accent hover:text-accent-dark underline underline-offset-2 cursor-pointer">
                Datenschutzerklärung
              </span>{' '}
              zu. <span className="text-status-error">*</span>
            </span>
          </label>
          {showError('consent') && (
            <motion.p id="err-consent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-status-error mt-1.5 ml-8" role="alert">
              {errors.consent}
            </motion.p>
          )}
        </div>

        <div className="flex items-center justify-between pt-4">
          <button
            type="button"
            onClick={onBack}
            disabled={isSubmitting}
            className="px-5 py-2.5 text-sm font-medium text-txt-secondary border border-border rounded-[10px] hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            Zurück
          </button>
          <motion.button
            type="submit"
            whileHover={!isSubmitting ? { scale: 1.02 } : {}}
            whileTap={!isSubmitting ? { scale: 0.98 } : {}}
            disabled={isSubmitting}
            className="px-6 py-2.5 text-sm font-semibold text-white bg-accent hover:bg-accent-dark rounded-[10px] transition-all disabled:opacity-60 disabled:cursor-not-allowed min-w-[200px] h-[44px] flex items-center justify-center"
          >
            {isSubmitting ? (
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full inline-block"
              />
            ) : (
              'Jetzt Bewertung absenden'
            )}
          </motion.button>
        </div>
      </form>
    </div>
  )
}
