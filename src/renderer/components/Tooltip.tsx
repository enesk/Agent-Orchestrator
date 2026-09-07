import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLanguage } from '../i18n'

interface Props {
  content: string
  label?: string
  position?: 'top' | 'bottom'
  maxWidth?: number
  className?: string
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return isMobile
}

export default function Tooltip({
  content,
  label,
  position = 'top',
  maxWidth = 320,
  className = '',
}: Props) {
  const { t } = useLanguage()
  const resolvedLabel = label ?? t('ui.tooltipLabel')

  const [visible, setVisible] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()

  const close = useCallback(() => setVisible(false), [])

  useEffect(() => {
    if (!visible) return
    function handleClickOutside(e: MouseEvent) {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        tooltipRef.current && !tooltipRef.current.contains(e.target as Node)
      ) {
        close()
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [visible, close])

  const positionClasses = position === 'top'
    ? 'bottom-full mb-2 left-1/2 -translate-x-1/2'
    : 'top-full mt-2 left-1/2 -translate-x-1/2'

  const desktopHandlers = isMobile ? {} : {
    onMouseEnter: () => setVisible(true),
    onMouseLeave: () => setVisible(false),
  }

  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        className="text-status-info hover:text-accent-dark text-sm font-medium transition-colors underline underline-offset-2 decoration-dotted"
        onClick={() => isMobile && setVisible(v => !v)}
        aria-describedby={visible ? 'tooltip-content' : undefined}
        {...desktopHandlers}
      >
        {resolvedLabel}
      </button>

      <AnimatePresence>
        {visible && (
          <>
            {isMobile && (
              <motion.div
                className="fixed inset-0 bg-black/20 z-40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={close}
              />
            )}

            <motion.div
              ref={tooltipRef}
              id="tooltip-content"
              role="tooltip"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              style={{ maxWidth }}
              className={
                isMobile
                  ? 'fixed bottom-0 left-0 right-0 z-50 bg-surface rounded-t-xl p-4 shadow-lg border-t border-border'
                  : `absolute z-50 ${positionClasses} bg-txt-primary text-surface text-xs leading-relaxed rounded-lg px-3 py-2 shadow-md pointer-events-none`
              }
            >
              {isMobile && (
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-semibold text-txt-primary">{resolvedLabel}</span>
                  <button
                    type="button"
                    onClick={close}
                    className="text-txt-muted hover:text-txt-primary p-1"
                    aria-label={t('ui.close')}
                  >
                    <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              )}
              <p className={isMobile ? 'text-sm text-txt-body' : ''}>{content}</p>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </span>
  )
}
