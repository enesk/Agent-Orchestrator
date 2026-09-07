import React, { useState } from 'react'
import { motion } from 'framer-motion'
import Tooltip from '../../Tooltip'

const STAY_TYPE_OPTIONS = [
  {
    value: 'stationiert',
    label: 'Stationiert',
    description: 'Dauerhaft an diesem Standort eingesetzt',
  },
  {
    value: 'kommandiert',
    label: 'Kommandiert',
    description: 'Vorübergehend an diesen Standort versetzt',
  },
  {
    value: 'durchreise',
    label: 'Durchreise',
    description: 'Kurzfristiger Aufenthalt auf der Durchreise',
  },
]

interface Props {
  value: string | null
  onChange: (value: string) => void
  onNext: () => void
  onBack: () => void
}

export default function StepStayType({ value, onChange, onNext, onBack }: Props) {
  const [touched, setTouched] = useState(false)
  const isValid = value !== null
  const showError = touched && !isValid

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-txt-primary">
          Wie waren Sie vor Ort?
        </h2>
        <p className="text-base text-txt-body mt-1">
          Wählen Sie die Art Ihres Aufenthalts.
        </p>
        <div className="mt-2">
          <Tooltip
            content="Die Art des Aufenthalts beeinflusst die Perspektive auf die Unterkunft. Stationierte haben oft andere Ansprüche als Durchreisende."
            label="Was bedeutet das?"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3" role="radiogroup" aria-label="Art des Aufenthalts">
        {STAY_TYPE_OPTIONS.map((option) => {
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
                w-full px-4 py-4 rounded-xl text-left transition-all border
                ${isSelected
                  ? 'bg-[#EEF2FF] border-accent border-2'
                  : 'bg-white border-border hover:border-accent/40 hover:bg-surface-hover'
                }
              `}
            >
              <span className="flex items-start gap-3">
                <span
                  className={`
                    w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5
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
                <span>
                  <span className={`block text-sm font-medium ${isSelected ? 'text-accent-dark' : 'text-txt-body'}`}>
                    {option.label}
                  </span>
                  <span className="block text-xs text-txt-muted mt-0.5">{option.description}</span>
                </span>
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
          Bitte wählen Sie eine Aufenthaltsart aus.
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
