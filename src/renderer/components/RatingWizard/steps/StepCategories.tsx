import React, { useState } from 'react'
import { motion } from 'framer-motion'

interface CategoryOption {
  value: string
  label: string
  icon: string
}

const CATEGORY_OPTIONS: CategoryOption[] = [
  { value: 'sauberkeit', label: 'Sauberkeit', icon: '✨' },
  { value: 'ausstattung', label: 'Ausstattung', icon: '🛏️' },
  { value: 'lage', label: 'Lage', icon: '📍' },
  { value: 'service', label: 'Service', icon: '🔔' },
  { value: 'verpflegung', label: 'Verpflegung', icon: '🍽️' },
  { value: 'atmosphaere', label: 'Atmosphäre', icon: '🌟' },
  { value: 'sicherheit', label: 'Sicherheit', icon: '🔒' },
  { value: 'preis_leistung', label: 'Preis-Leistung', icon: '💰' },
]

interface Props {
  value: string[]
  onChange: (value: string[]) => void
  onNext: () => void
  onBack: () => void
}

export default function StepCategories({ value, onChange, onNext, onBack }: Props) {
  const [touched, setTouched] = useState(false)
  const isValid = value.length >= 1
  const showError = touched && !isValid

  const toggle = (categoryValue: string) => {
    onChange(
      value.includes(categoryValue)
        ? value.filter((v) => v !== categoryValue)
        : [...value, categoryValue]
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-txt-primary">
          Welche Bereiche möchten Sie bewerten?
        </h2>
        <p className="text-base text-txt-body mt-1">
          Wählen Sie mindestens eine Kategorie aus. <span className="text-status-error">*</span>
        </p>
      </div>

      <div
        className="grid grid-cols-2 sm:grid-cols-3 gap-3"
        role="group"
        aria-label="Bewertungskategorien (mindestens 1 auswählen)"
      >
        {CATEGORY_OPTIONS.map((option) => {
          const isSelected = value.includes(option.value)
          return (
            <motion.button
              key={option.value}
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => toggle(option.value)}
              role="checkbox"
              aria-checked={isSelected}
              className={`
                relative flex flex-col items-center justify-center gap-2 px-3 py-4 rounded-xl
                min-h-[80px] text-center transition-all border
                ${isSelected
                  ? 'bg-[#EEF2FF] border-accent border-2'
                  : 'bg-white border-border hover:border-accent/40 hover:bg-surface-hover'
                }
              `}
            >
              {isSelected && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-2 right-2"
                >
                  <svg className="w-4 h-4 text-accent" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </motion.span>
              )}
              <span className="text-2xl" aria-hidden="true">{option.icon}</span>
              <span className={`text-sm font-medium ${isSelected ? 'text-accent-dark' : 'text-txt-body'}`}>
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
          Bitte wählen Sie mindestens eine Kategorie aus.
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
