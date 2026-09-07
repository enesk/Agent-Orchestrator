import React from 'react'
import { motion } from 'framer-motion'

interface SummaryData {
  period: string | null
  stayType: string | null
  impression: string
  categories: string[]
  facilitiesInside: string[]
  facilitiesNearby: string[]
  demographics: {
    sleepType: string | null
    rank: string | null
    ageGroup: string | null
    familyStatus: string | null
  }
  suitableFor: string[]
  title: string
  reviewText: string
}

interface Props {
  value: SummaryData
  onNext: () => void
  onBack: () => void
  onGoToStep: (stepId: string) => void
}

function SummarySection({
  label,
  stepId,
  onEdit,
  children,
}: {
  label: string
  stepId: string
  onEdit: (stepId: string) => void
  children: React.ReactNode
}) {
  return (
    <div className="border border-border rounded-xl px-4 py-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium text-txt-body">{label}</span>
        <button
          type="button"
          onClick={() => onEdit(stepId)}
          className="text-xs font-medium text-accent hover:text-accent-dark transition-colors"
        >
          Ändern
        </button>
      </div>
      <div className="text-sm text-txt-secondary">{children}</div>
    </div>
  )
}

const PERIOD_LABELS: Record<string, string> = {
  '0-3': '0–3 Monate',
  '3-6': '3–6 Monate',
  '6-12': '6–12 Monate',
  '12+': 'Über 12 Monate',
}

const STAY_TYPE_LABELS: Record<string, string> = {
  grundausbildung: 'Grundausbildung',
  dienststelle: 'Dienststelle',
  lehrgang: 'Lehrgang',
  uebung: 'Übung',
}

const DEMOGRAPHIC_LABELS: Record<string, Record<string, string>> = {
  sleepType: {
    heimschlaefer: 'Heimschläfer',
    kasernenschlaefer: 'Kasernenschläfer',
  },
  rank: {
    mannschaft: 'Mannschaftssoldat',
    unteroffizier: 'Unteroffizier',
    offizier: 'Offizier',
    zivilist: 'Zivilist',
  },
  ageGroup: {
    u18: 'unter 18',
    u30: 'unter 30',
    u50: 'unter 50',
    ue50: 'über 50',
  },
  familyStatus: {
    single: 'Single',
    paar: 'Paar',
    familie: 'Familie',
  },
}

const SUITABLE_FOR_LABELS: Record<string, string> = {
  paare: 'Paare',
  familien: 'Familien',
  singles: 'Singles',
  senioren: 'Senioren',
  freundesgruppen: 'Freundesgruppen',
  geschaeftsreisende: 'Geschäftsreisende',
}

export default function StepSummary({ value, onNext, onBack, onGoToStep }: Props) {
  const demographicEntries = Object.entries(value.demographics).filter(
    ([, v]) => v !== null
  ) as [string, string][]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-txt-primary">
          Ihre Bewertung im Überblick
        </h2>
        <p className="text-base text-txt-body mt-1">
          Prüfen Sie Ihre Angaben, bevor Sie fortfahren.
        </p>
      </div>

      <div className="space-y-3">
        <SummarySection label="Zeitraum" stepId="period" onEdit={onGoToStep}>
          {value.period ? PERIOD_LABELS[value.period] ?? value.period : '—'}
        </SummarySection>

        <SummarySection label="Aufenthaltsart" stepId="stayType" onEdit={onGoToStep}>
          {value.stayType ? STAY_TYPE_LABELS[value.stayType] ?? value.stayType : '—'}
        </SummarySection>

        <SummarySection label="Gesamteindruck" stepId="impression" onEdit={onGoToStep}>
          <p className="line-clamp-3">{value.impression || '—'}</p>
        </SummarySection>

        {value.categories.length > 0 && (
          <SummarySection label="Kategorien" stepId="categories" onEdit={onGoToStep}>
            {value.categories.join(', ')}
          </SummarySection>
        )}

        {value.facilitiesInside.length > 0 && (
          <SummarySection label="Einrichtungen (Gebäude)" stepId="facilitiesInside" onEdit={onGoToStep}>
            {value.facilitiesInside.join(', ')}
          </SummarySection>
        )}

        {value.facilitiesNearby.length > 0 && (
          <SummarySection label="Einrichtungen (Nähe)" stepId="facilitiesNearby" onEdit={onGoToStep}>
            {value.facilitiesNearby.join(', ')}
          </SummarySection>
        )}

        {demographicEntries.length > 0 && (
          <SummarySection label="Persönliche Angaben" stepId="demographics" onEdit={onGoToStep}>
            <ul className="space-y-0.5">
              {demographicEntries.map(([key, val]) => (
                <li key={key}>
                  {DEMOGRAPHIC_LABELS[key]?.[val] ?? val}
                </li>
              ))}
            </ul>
          </SummarySection>
        )}

        {value.suitableFor.length > 0 && (
          <SummarySection label="Geeignet für" stepId="suitableFor" onEdit={onGoToStep}>
            {value.suitableFor.map((v) => SUITABLE_FOR_LABELS[v] ?? v).join(', ')}
          </SummarySection>
        )}

        <SummarySection label="Titel" stepId="title" onEdit={onGoToStep}>
          {value.title || '—'}
        </SummarySection>

        <SummarySection label="Bewertungstext" stepId="reviewText" onEdit={onGoToStep}>
          <p className="line-clamp-3">{value.reviewText || '—'}</p>
        </SummarySection>
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
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onNext}
          className="px-5 py-2.5 text-sm font-medium text-white bg-accent hover:bg-accent-dark rounded-[10px] transition-colors"
        >
          Weiter
        </motion.button>
      </div>
    </div>
  )
}
