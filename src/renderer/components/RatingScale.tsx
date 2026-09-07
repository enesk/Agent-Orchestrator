import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useLanguage } from '../i18n'

interface ScaleLabels {
  low?: string
  mid?: string
  high?: string
}

interface Props {
  value: number | null
  onChange: (value: number) => void
  max?: number
  variant?: 'star' | 'circle'
  labels?: ScaleLabels
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeConfig = {
  sm: { icon: 'w-5 h-5', gap: 'gap-1', text: 'text-xs' },
  md: { icon: 'w-7 h-7', gap: 'gap-2', text: 'text-sm' },
  lg: { icon: 'w-9 h-9', gap: 'gap-3', text: 'text-base' },
}

function getLabel(index: number, max: number, labels: Required<ScaleLabels>): string {
  const ratio = index / (max - 1)
  if (ratio <= 0.25) return labels.low
  if (ratio <= 0.75) return labels.mid
  return labels.high
}

function StarIcon({ filled, className }: { filled: boolean; className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
    </svg>
  )
}

function CircleIcon({ filled, className }: { filled: boolean; className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.5}>
      <circle cx="12" cy="12" r="9" />
    </svg>
  )
}

export default function RatingScale({
  value,
  onChange,
  max = 5,
  variant = 'star',
  labels,
  disabled = false,
  size = 'md',
  className = '',
}: Props) {
  const { t } = useLanguage()
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  const resolvedLabels: Required<ScaleLabels> = {
    low: labels?.low ?? t('ui.ratingLow'),
    mid: labels?.mid ?? t('ui.ratingMid'),
    high: labels?.high ?? t('ui.ratingHigh'),
  }

  const s = sizeConfig[size]
  const Icon = variant === 'star' ? StarIcon : CircleIcon
  const activeIndex = hoveredIndex ?? (value !== null ? value - 1 : -1)
  const currentLabel = activeIndex >= 0 ? getLabel(activeIndex, max, resolvedLabels) : null

  return (
    <div className={`flex flex-col items-start gap-1 ${className}`}>
      <div className={`flex items-center ${s.gap}`}>
        {Array.from({ length: max }, (_, i) => {
          const filled = i <= activeIndex
          return (
            <motion.button
              key={i}
              type="button"
              disabled={disabled}
              whileHover={disabled ? {} : { scale: 1.15 }}
              whileTap={disabled ? {} : { scale: 0.9 }}
              className={`
                ${s.icon} transition-colors
                ${filled ? 'text-accent2' : 'text-txt-muted'}
                ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:text-accent2-dark'}
              `}
              onMouseEnter={() => !disabled && setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              onClick={() => !disabled && onChange(i + 1)}
              aria-label={`${i + 1} ${t('ui.ratingOf')} ${max}: ${getLabel(i, max, resolvedLabels)}`}
            >
              <Icon filled={filled} className="w-full h-full" />
            </motion.button>
          )
        })}
      </div>

      <div className={`${s.text} text-txt-secondary h-5 transition-opacity ${currentLabel ? 'opacity-100' : 'opacity-0'}`}>
        {currentLabel || '\u00A0'}
      </div>
    </div>
  )
}
