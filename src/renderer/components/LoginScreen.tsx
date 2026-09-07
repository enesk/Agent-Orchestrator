import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useIpc } from '../hooks/useIpc'
import { useLanguage } from '../i18n/LanguageContext'
import { LANGUAGES } from '../i18n/translations'

interface Props {
  onConnect: (url: string, token: string) => Promise<void>
  error: string | null
}

export default function LoginScreen({ onConnect, error }: Props) {
  const ipc = useIpc()
  const { t, lang, setLang } = useLanguage()
  const [backendUrl, setBackendUrl] = useState('')
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [autoConnect, setAutoConnect] = useState(false)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    ipc.getSettings().then((s) => {
      if (s.backendUrl && s.backendUrl !== 'wss://localhost:8080/ws') {
        setBackendUrl(s.backendUrl)
      }
      setAutoConnect(s.autoStart)
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (connecting) return
    setConnecting(true)
    try {
      await ipc.saveSettings({ autoStart: autoConnect })
      await onConnect(backendUrl, token)
    } catch {
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div
      className="flex items-center justify-center h-full drag-region relative"
      style={{ background: 'linear-gradient(180deg, #FAFBFC 0%, #EEF2FF 100%)' }}
    >
      {/* Subtle grid background */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, #6366F1 1px, transparent 0)',
        backgroundSize: '32px 32px',
      }} />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-[420px] mx-4 no-drag"
      >
        {/* Language selector */}
        <div className="flex justify-center gap-1.5 mb-6">
          {LANGUAGES.map((l) => (
            <button
              key={l.value}
              onClick={() => setLang(l.value)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                lang === l.value ? 'bg-accent-muted text-accent' : 'text-txt-muted hover:text-txt-primary hover:bg-white/60'
              }`}
            >
              {l.flag} {l.label}
            </button>
          ))}
        </div>

        {/* Card */}
        <div
          className="bg-white"
          style={{
            borderRadius: '24px',
            padding: '48px',
            boxShadow: '0 24px 64px rgba(0,0,0,0.08)',
          }}
        >
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center mb-5 ring-1 ring-accent/20">
              <svg width="24" height="24" viewBox="0 0 48 48" fill="none">
                <circle cx="24" cy="24" r="8" stroke="#6366F1" strokeWidth="2" fill="none" />
                <circle cx="24" cy="24" r="3" fill="#6366F1" />
                <circle cx="24" cy="12" r="2.5" fill="#6366F1" opacity="0.6" />
                <circle cx="34.4" cy="30" r="2.5" fill="#6366F1" opacity="0.6" />
                <circle cx="13.6" cy="30" r="2.5" fill="#6366F1" opacity="0.6" />
                <line x1="24" y1="16" x2="24" y2="21" stroke="#6366F1" strokeWidth="1.5" opacity="0.4" />
                <line x1="28" y1="26.5" x2="32" y2="28.5" stroke="#6366F1" strokeWidth="1.5" opacity="0.4" />
                <line x1="20" y1="26.5" x2="16" y2="28.5" stroke="#6366F1" strokeWidth="1.5" opacity="0.4" />
              </svg>
            </div>
            <h1 className="text-[28px] font-bold text-accent">{t('login.title')}</h1>
            <p className="text-base text-txt-secondary mt-1.5">{t('login.subtitle')}</p>
          </div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-5 overflow-hidden"
              >
                <div className="px-4 py-3 rounded-xl bg-status-error/8 border border-status-error/15 text-status-error text-sm">
                  {error}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-txt-body mb-1.5 font-medium">{t('login.backendUrl')}</label>
              <input
                type="text"
                value={backendUrl}
                onChange={(e) => setBackendUrl(e.target.value)}
                placeholder={t('login.backendPlaceholder')}
                className="w-full px-4 h-12 bg-surface-dark border border-border rounded-[10px] text-base text-txt-primary placeholder-txt-muted focus:border-accent focus:ring-[3px] focus:ring-accent/10 outline-none transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-txt-body mb-1.5 font-medium">{t('login.token')}</label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={t('login.tokenPlaceholder')}
                  className="w-full px-4 h-12 pr-10 bg-surface-dark border border-border rounded-[10px] text-base text-txt-primary placeholder-txt-muted focus:border-accent focus:ring-[3px] focus:ring-accent/10 outline-none transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-txt-muted hover:text-txt-primary transition-colors"
                  tabIndex={-1}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    {showToken ? (
                      <>
                        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </>
                    ) : (
                      <>
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </>
                    )}
                  </svg>
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer group py-1">
              <div className="relative">
                <input type="checkbox" checked={autoConnect} onChange={(e) => setAutoConnect(e.target.checked)} className="sr-only peer" />
                <div className="w-4.5 h-4.5 rounded-md border border-border-light bg-white peer-checked:bg-accent peer-checked:border-accent transition-colors flex items-center justify-center">
                  {autoConnect && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              </div>
              <span className="text-sm text-txt-secondary group-hover:text-txt-primary transition-colors">
                {t('login.autoConnect')}
              </span>
            </label>

            <motion.button
              type="submit"
              disabled={connecting || !backendUrl || !token}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className="w-full h-[52px] rounded-xl font-semibold text-base bg-accent text-white hover:bg-accent-dark disabled:bg-surface-light disabled:text-txt-muted disabled:cursor-not-allowed transition-all mt-2"
            >
              {connecting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {t('login.connecting')}
                </span>
              ) : t('login.connect')}
            </motion.button>
          </form>
        </div>
      </motion.div>
    </div>
  )
}
