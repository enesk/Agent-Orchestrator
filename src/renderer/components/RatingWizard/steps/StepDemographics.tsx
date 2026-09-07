import React, { useState } from 'react'
import { motion } from 'framer-motion'
import Tooltip from '../../Tooltip'
import SkipButton from '../../SkipButton'

interface DemographicsData {
  sleepType: string | null
  rank: string | null
  ageGroup: string | null
  familyStatus: string | null
}

interface Props {
  value: DemographicsData
  onChange: (data: DemographicsData) => void
  onNext: () => void
  onBack: () => void
  onSkip: () => void
}

interface RadioRowProps {
  label: string
  options: { value: string; label: string }[]
  selected: string | null
  onSelect: (value: string) => void
}

function RadioRow({ label, options, selected, onSelect }: RadioRowProps) {
  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-txt-body">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = selected === option.value
          return (
            <motion.button
              key={option.value}
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => onSelect(option.value)}
              className={`
                px-4 py-2.5 rounded-[10px] text-sm font-medium transition-all border
                ${isSelected
                  ? 'bg-[#EEF2FF] border-accent text-accent-dark'
                  : 'bg-white border-border text-txt-body hover:border-accent/40 hover:bg-surface-light'
                }
              `}
              role="radio"
              aria-checked={isSelected}
            >
              {option.label}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

const rows: { key: keyof DemographicsData; label: string; options: { value: string; label: string }[] }[] = [
  {
    key: 'sleepType',
    label: 'Unterkunftsart',
    options: [
      { value: 'heimschlaefer', label: 'Heimschläfer' },
      { value: 'kasernenschlaefer', label: 'Kasernenschläfer' },
    ],
  },
  {
    key: 'rank',
    label: 'Dienstgrad-Gruppe',
    options: [
      { value: 'mannschaft', label: 'Mannschaftssoldat' },
      { value: 'unteroffizier', label: 'Unteroffizier' },
      { value: 'offizier', label: 'Offizier' },
      { value: 'zivilist', label: 'Zivilist' },
    ],
  },
  {
    key: 'ageGroup',
    label: 'Altersgruppe',
    options: [
      { value: 'u18', label: 'unter 18' },
      { value: 'u30', label: 'unter 30' },
      { value: 'u50', label: 'unter 50' },
      { value: 'ue50', label: 'über 50' },
    ],
  },
  {
    key: 'familyStatus',
    label: 'Familienstand',
    options: [
      { value: 'single', label: 'Single' },
      { value: 'paar', label: 'Paar' },
      { value: 'familie', label: 'Familie' },
    ],
  },
]

export default function StepDemographics({ value, onChange, onNext, onBack, onSkip }: Props) {
  const handleSelect = (key: keyof DemographicsData, val: string) => {
    onChange({ ...value, [key]: value[key] === val ? null : val })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-txt-primary">Angaben zu Ihrer Person</h2>
        <p className="text-base text-txt-body mt-1">
          Diese Angaben sind freiwillig und helfen anderen bei der Einordnung.
        </p>
        <div className="mt-2">
          <Tooltip
            content="Demografische Daten helfen anderen Nutzern, Bewertungen besser einzuordnen. Alle Angaben sind optional und können übersprungen werden."
            label="Warum fragen wir das?"
          />
        </div>
      </div>

      <div className="space-y-5" role="group" aria-label="Demografische Angaben (optional)">
        {rows.map((row) => (
          <RadioRow
            key={row.key}
            label={row.label}
            options={row.options}
            selected={value[row.key]}
            onSelect={(val) => handleSelect(row.key, val)}
          />
        ))}
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
