import React, { useState } from 'react'
import { motion } from 'framer-motion'
import CharCounter from '../../CharCounter'

const MIN_CHARS = 100

interface Props {
  value: string
  onChange: (value: string) => void
  onNext: () => void
  onBack: () => void
}

export default function StepImpression({ value, onChange, onNext, onBack }: Props) {
  const [touched, setTouched] = useState(false)
  const isValid = value.length >= MIN_CHARS
  const showError = touched && !isValid

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-txt-primary">
          Beschreiben Sie Ihren Gesamteindruck
        </h2>
        <p className="text-base text-txt-body mt-1">
          Teilen Sie Ihre Erfahrungen, damit andere sich ein besseres Bild machen können.
        </p>
      </div>

      <div>
        <label htmlFor="impression-text" className="block text-sm font-medium text-txt-body mb-1.5">
          Ihr Eindruck <span className="text-status-error">*</span>
        </label>
        <textarea
          id="impression-text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="Beschreiben Sie Ihren Aufenthalt: Wie war die Unterkunft? Was hat Ihnen gefallen, was könnte verbessert werden? Wie war die Atmosphäre vor Ort?"
          rows={6}
          aria-invalid={showError}
          aria-describedby="impression-counter impression-error impression-hint"
          className={`
            w-full px-4 py-3 rounded-[10px] bg-surface-dark border text-[15px] text-txt-primary
            placeholder:text-txt-muted outline-none transition-all resize-y min-h-[160px] sm:min-h-[200px]
            ${showError
              ? 'border-status-error focus:border-status-error focus:ring-[3px] focus:ring-status-error/10'
              : 'border-border focus:border-accent focus:ring-[3px] focus:ring-accent/10'
            }
          `}
        />
        <div className="flex items-center justify-between mt-1.5">
          <div id="impression-counter">
            <CharCounter current={value.length} min={MIN_CHARS} />
          </div>
          {showError && (
            <motion.span
              id="impression-error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-status-error"
              role="alert"
            >
              Mindestens {MIN_CHARS} Zeichen erforderlich
            </motion.span>
          )}
        </div>
      </div>

      <div
        id="impression-hint"
        className="bg-status-warning-bg border border-status-warning/20 rounded-[10px] px-4 py-3"
      >
        <p className="text-xs text-txt-body leading-relaxed">
          <span className="font-medium">Hinweis:</span> Bitte geben Sie keine personenbezogenen Daten
          (Namen, Dienstnummern, etc.) in Ihrer Bewertung an.
        </p>
      </div>

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="px-5 py-2.5 text-sm font-medium text-txt-secondary border border-border rounded-[10px] hover:bg-surface-hover transition-colors"
        >
          Zurück
        </button>
        <motion.button
          type="button"
          whileHover={isValid ? { scale: 1.02 } : {}}
          whileTap={isValid ? { scale: 0.98 } : {}}
          onClick={() => {
            setTouched(true)
            if (isValid) onNext()
          }}
          disabled={!isValid}
          className={`
            px-5 py-2.5 text-sm font-medium rounded-[10px] transition-all
            ${isValid
              ? 'text-white bg-accent hover:bg-accent-dark'
              : 'text-white bg-accent/40 cursor-not-allowed'
            }
          `}
        >
          Weiter
        </motion.button>
      </div>
    </div>
  )
}
