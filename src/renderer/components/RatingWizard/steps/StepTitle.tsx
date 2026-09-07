import React, { useState } from 'react'
import { motion } from 'framer-motion'
import CharCounter from '../../CharCounter'
import Tooltip from '../../Tooltip'

interface Props {
  value: string
  onChange: (value: string) => void
  onNext: () => void
  onBack: () => void
}

const MIN_CHARS = 100

export default function StepTitle({ value, onChange, onNext, onBack }: Props) {
  const [touched, setTouched] = useState(false)
  const isValid = value.length >= MIN_CHARS
  const showError = touched && !isValid

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-txt-primary">
          Geben Sie Ihrer Bewertung einen Titel
        </h2>
        <p className="text-base text-txt-body mt-1">
          Ein guter Titel fasst Ihr Erlebnis in wenigen Worten zusammen.
        </p>
        <div className="mt-2">
          <Tooltip
            content="Ein aussagekräftiger Titel hilft anderen Nutzern, Ihre Bewertung schnell einzuordnen. Beschreiben Sie Ihren Gesamteindruck in mindestens 100 Zeichen."
            label="Tipps für einen guten Titel"
          />
        </div>
      </div>

      <div>
        <label htmlFor="review-title" className="block text-sm font-medium text-txt-body mb-1.5">
          Titel <span className="text-status-error">*</span>
        </label>
        <input
          id="review-title"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="z.B. Traumhafter Aufenthalt mit kleinen Abstrichen beim Service"
          aria-invalid={showError}
          aria-describedby="title-counter title-error"
          className={`
            w-full px-4 h-11 rounded-[10px] bg-surface-dark border text-[15px] text-txt-primary
            placeholder:text-txt-muted outline-none transition-all
            ${showError
              ? 'border-status-error focus:border-status-error focus:ring-[3px] focus:ring-status-error/10'
              : 'border-border focus:border-accent focus:ring-[3px] focus:ring-accent/10'
            }
          `}
        />
        <div className="flex items-center justify-between mt-1.5">
          <div id="title-counter">
            <CharCounter current={value.length} min={MIN_CHARS} />
          </div>
          {showError && (
            <motion.span
              id="title-error"
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

      <div className="text-sm text-txt-secondary space-y-1">
        <p className="font-medium">Beispiele:</p>
        <ul className="list-disc list-inside text-txt-muted space-y-0.5">
          <li>"Perfekt für Familien mit kleinen Kindern"</li>
          <li>"Tolles Hotel, mäßiges Essen — aber die Lage macht alles wett"</li>
          <li>"Preis-Leistung top, würde jederzeit wiederkommen"</li>
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
