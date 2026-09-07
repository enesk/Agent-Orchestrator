import React from 'react'
import { motion } from 'framer-motion'
import { useLanguage } from '../i18n'

interface Props {
  currentStep: number
  totalSteps: number
  showLabel?: boolean
  size?: 'sm' | 'md' | 'lg'
  color?: 'accent' | 'success' | 'warning'
  className?: string
}

const sizeConfig = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
}

const colorConfig = {
  accent: 'bg-accent',
  success: 'bg-status-success',
  warning: 'bg-status-warning',
}

export default function ProgressBar({
  currentStep,
  totalSteps,
  showLabel = false,
  size = 'md',
  color = 'accent',
  className = '',
}: Props) {
  const { t } = useLanguage()
  const clampedStep = Math.max(0, Math.min(currentStep, totalSteps))
  const percentage = totalSteps > 0 ? (clampedStep / totalSteps) * 100 : 0

  return (
    <div className={`w-full ${className}`}>
      {showLabel && (
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-txt-secondary font-medium">
            {t('ui.progressStep')} {clampedStep} {t('ui.progressOf')} {totalSteps}
          </span>
          <span className="text-xs text-txt-muted">
            {Math.round(percentage)}%
          </span>
        </div>
      )}
      <div className={`w-full ${sizeConfig[size]} bg-surface-active rounded-full overflow-hidden`}>
        <motion.div
          className={`h-full ${colorConfig[color]} rounded-full`}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          role="progressbar"
          aria-valuenow={clampedStep}
          aria-valuemin={0}
          aria-valuemax={totalSteps}
          aria-label={`${t('ui.progressStep')} ${clampedStep} ${t('ui.progressOf')} ${totalSteps}`}
        />
      </div>
    </div>
  )
}
