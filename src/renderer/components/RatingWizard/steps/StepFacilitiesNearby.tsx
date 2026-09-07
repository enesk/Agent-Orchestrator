import React from 'react'
import { motion } from 'framer-motion'
import SkipButton from '../../SkipButton'

interface FacilityOption {
  value: string
  label: string
  icon: string
}

const FACILITY_OPTIONS_NEARBY: FacilityOption[] = [
  { value: 'supermarkt', label: 'Supermarkt', icon: '🛒' },
  { value: 'oepnv', label: 'ÖPNV', icon: '🚌' },
  { value: 'restaurant', label: 'Restaurant', icon: '🍕' },
  { value: 'sportplatz', label: 'Sportplatz', icon: '⚽' },
  { value: 'arzt', label: 'Arzt / Apotheke', icon: '🏥' },
  { value: 'bank', label: 'Bank / Geldautomat', icon: '🏧' },
  { value: 'baeckerei', label: 'Bäckerei', icon: '🥐' },
  { value: 'imbiss', label: 'Imbiss / Fast Food', icon: '🍔' },
  { value: 'naherholung', label: 'Naherholung', icon: '🌳' },
  { value: 'tankstelle', label: 'Tankstelle', icon: '⛽' },
]

interface Props {
  value: string[]
  onChange: (value: string[]) => void
  onNext: () => void
  onBack: () => void
  onSkip: () => void
}

export default function StepFacilitiesNearby({ value, onChange, onNext, onBack, onSkip }: Props) {
  const toggle = (facilityValue: string) => {
    onChange(
      value.includes(facilityValue)
        ? value.filter((v) => v !== facilityValue)
        : [...value, facilityValue]
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-txt-primary">
          Was gibt es in der Nähe?
        </h2>
        <p className="text-base text-txt-body mt-1">
          Wählen Sie alle zutreffenden aus. <span className="text-txt-muted">(Optional)</span>
        </p>
      </div>

      <div
        className="grid grid-cols-2 sm:grid-cols-3 gap-3"
        role="group"
        aria-label="Einrichtungen in der Nähe (optional)"
      >
        {FACILITY_OPTIONS_NEARBY.map((option) => {
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

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="px-5 py-2.5 text-sm font-medium text-txt-secondary border border-border rounded-[10px] hover:bg-surface-hover transition-colors"
        >
          Zurück
        </button>
        <div className="flex items-center gap-3">
          <SkipButton onClick={onSkip} label="Überspringen" />
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onNext}
            className="px-5 py-2.5 text-sm font-medium text-white bg-accent hover:bg-accent-dark rounded-[10px] transition-colors"
          >
            Weiter
          </motion.button>
        </div>
      </div>
    </div>
  )
}
