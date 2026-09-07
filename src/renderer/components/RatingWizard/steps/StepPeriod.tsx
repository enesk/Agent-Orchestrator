import React, { useState } from 'react'
import { motion } from 'framer-motion'
import Tooltip from '../../Tooltip'

const PERIOD_OPTIONS = [
  { value: 'unter_1_monat', label: 'Weniger als 1 Monat' },
  { value: '1_3_monate', label: '1–3 Monate' },
  { value: '3_6_monate', label: '3–6 Monate' },
  { value: '6_12_monate', label: '6–12 Monate' },
  { value: 'ueber_12_monate', label: 'Mehr als 12 Monate' },
]

interface Props {
  value: string | null
  onChange: (value: string) => void
  onNext: () => void
  onBack: () => void
}

export default function StepPeriod({ value, onChange, onNext, onBack }: Props) {
  const [touched, setTouched] = useState(false)
  const isValid = value !== null
  const showError = touched && !isValid

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-txt-primary">
          Wie lange waren Sie vor Ort?
        </h2>
        <p className="text-base text-txt-body mt-1">
          Wählen Sie den Zeitraum Ihres Aufenthalts.
        </p>
        <div className="mt-2">
          <Tooltip
            content="Der Zeitraum hilft anderen, Ihre Bewertung besser einzuordnen. Ein längerer Aufenthalt ermöglicht in der Regel umfassendere Eindrücke."
            label="Warum ist das wichtig?"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3" role="radiogroup" aria-label="Aufenthaltszeitraum">
        {PERIOD_OPTIONS.map((option) => {
          const isSelected = value === option.value
          return (
            <motion.button
              key={option.value}
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={() => onChange(option.value)}
              role="radio"
              aria-checked={isSelected}
              className={`
                w-full px-4 py-3.5 rounded-xl text-sm font-medium text-left transition-all border
                ${isSelected
                  ? 'bg-[#EEF2FF] border-accent text-accent-dark border-2'
                  : 'bg-white border-border text-txt-body hover:border-accent/40 hover:bg-surface-hover'
                }
              `}
            >
              <span className="flex items-center gap-3">
                <span
                  className={`
                    w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0
                    ${isSelected ? 'border-accent' : 'border-border'}
                  `}
                >
                  {isSelected && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-2.5 h-2.5 rounded-full bg-accent"
                    />
                  )}
                </span>
                {option.label}
              </span>
            </motion.button>
          )
        })}
      </div>

      {showError && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-xs text-status-error"
          role="alert"
        >
          Bitte wählen Sie einen Zeitraum aus.
        </motion.p>
      )}

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
