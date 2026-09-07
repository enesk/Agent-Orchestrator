import React from 'react'
import { motion } from 'framer-motion'
import { useLanguage } from '../i18n'

interface Props {
  onClick: () => void
  label?: string
  disabled?: boolean
  className?: string
}

export default function SkipButton({
  onClick,
  label,
  disabled = false,
  className = '',
}: Props) {
  const { t } = useLanguage()
  const resolvedLabel = label ?? t('ui.skip')

  return (
    <motion.button
      type="button"
      disabled={disabled}
      whileHover={disabled ? {} : { scale: 1.02 }}
      whileTap={disabled ? {} : { scale: 0.98 }}
      onClick={onClick}
      className={`
        px-4 py-2 text-sm font-medium rounded-lg transition-colors
        ${disabled
          ? 'text-txt-muted cursor-not-allowed'
          : 'text-txt-secondary hover:text-txt-primary hover:bg-surface-hover active:bg-surface-active'
        }
        ${className}
      `}
    >
      {resolvedLabel}
    </motion.button>
  )
}
