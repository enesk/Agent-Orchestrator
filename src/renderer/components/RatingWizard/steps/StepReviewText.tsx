import React, { useState } from 'react'
import { motion } from 'framer-motion'
import CharCounter from '../../CharCounter'

interface Props {
  value: string
  onChange: (value: string) => void
  onNext: () => void
  onBack: () => void
}

const MIN_CHARS = 50
const MAX_CHARS = 2000

export default function StepReviewText({ value, onChange, onNext, onBack }: Props) {
  const [touched, setTouched] = useState(false)
  const isValid = value.length >= MIN_CHARS && value.length <= MAX_CHARS
  const showError = touched && !isValid

  const errorMessage =
    value.length > MAX_CHARS
      ? `Maximal ${MAX_CHARS} Zeichen erlaubt`
      : `Mindestens ${MIN_CHARS} Zeichen erforderlich`

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-txt-primary">
          Beschreiben Sie Ihren Aufenthalt
        </h2>
        <p className="text-base text-txt-body mt-1">
          Teilen Sie Ihre Erfahrungen mit anderen Nutzern.
        </p>
      </div>

      <div>
        <label htmlFor="review-text" className="block text-sm font-medium text-txt-body mb-1.5">
          Bewertungstext <span className="text-status-error">*</span>
        </label>
        <textarea
          id="review-text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="Was hat Ihnen besonders gefallen? Was könnte verbessert werden? Würden Sie die Unterkunft weiterempfehlen?"
          rows={7}
          aria-invalid={showError}
          aria-describedby="review-counter review-error"
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
          <div id="review-counter">
            <CharCounter current={value.length} min={MIN_CHARS} max={MAX_CHARS} />
          </div>
          {showError && (
            <motion.span
              id="review-error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-status-error"
              role="alert"
            >
              {errorMessage}
            </motion.span>
          )}
        </div>
      </div>

      <div className="text-sm text-txt-secondary space-y-1">
        <p className="font-medium">Tipps für eine gute Bewertung:</p>
        <ul className="list-disc list-inside text-txt-muted space-y-0.5">
          <li>Was hat Ihnen besonders gefallen?</li>
          <li>Was könnte verbessert werden?</li>
          <li>Würden Sie die Unterkunft weiterempfehlen?</li>
        </ul>
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
