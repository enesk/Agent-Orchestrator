import React from 'react'
import { motion } from 'framer-motion'

interface Props {
  onNext: () => void
  onBack: () => void
}

export default function StepNotice({ onNext, onBack }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-txt-primary">
          Hinweis zur Bewertung
        </h2>
      </div>

      <div className="bg-surface-light border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex-shrink-0 w-8 h-8 rounded-full bg-status-info/10 flex items-center justify-center mt-0.5">
            <svg className="w-4 h-4 text-status-info" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </span>
          <div className="space-y-3 text-sm text-txt-body leading-relaxed">
            <p>
              Vielen Dank, dass Sie sich die Zeit nehmen, eine Bewertung abzugeben.
              Ihre Meinung hilft uns, die Qualität der Unterkünfte stetig zu verbessern.
            </p>
            <p>
              Bitte beachten Sie, dass Ihre Bewertung sachlich und fair sein sollte.
              Vermeiden Sie bitte personenbezogene Daten oder beleidigende Inhalte.
            </p>
            <p>
              Alle Bewertungen werden vor der Veröffentlichung geprüft.
            </p>
          </div>
        </div>
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
          Alles klar
        </motion.button>
      </div>
    </div>
  )
}
