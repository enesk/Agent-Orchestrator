import React, { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ProgressBar from '../ProgressBar'
import {
  StepEmailVerification,
  StepNotice,
  StepPeriod,
  StepStayType,
  StepImpression,
  StepCategories,
  StepFacilitiesInside,
  StepFacilitiesNearby,
  StepDemographics,
  StepSuitableFor,
  StepTitle,
  StepReviewText,
  StepSummary,
  StepSubmit,
  StepVerificationModal,
} from './steps'

// ── Wizard State ────────────────────────────────────────────────────────────

interface WizardFormData {
  verificationEmail: string
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
  submit: {
    firstName: string
    email: string
    consent: boolean
  }
}

const INITIAL_FORM_DATA: WizardFormData = {
  verificationEmail: '',
  period: null,
  stayType: null,
  impression: '',
  categories: [],
  facilitiesInside: [],
  facilitiesNearby: [],
  demographics: {
    sleepType: null,
    rank: null,
    ageGroup: null,
    familyStatus: null,
  },
  suitableFor: [],
  title: '',
  reviewText: '',
  submit: {
    firstName: '',
    email: '',
    consent: false,
  },
}

// ── Step Configuration ──────────────────────────────────────────────────────

interface StepConfig {
  id: string
  label: string
  group: string
  skippable: boolean
}

const STEPS: StepConfig[] = [
  { id: 'emailVerification', label: 'E-Mail', group: 'Verifizierung', skippable: false },
  { id: 'notice', label: 'Hinweis', group: 'Hinweis', skippable: false },
  { id: 'period', label: 'Zeitraum', group: 'Grunddaten', skippable: false },
  { id: 'stayType', label: 'Aufenthaltsart', group: 'Grunddaten', skippable: false },
  { id: 'impression', label: 'Gesamteindruck', group: 'Bewertung', skippable: false },
  { id: 'categories', label: 'Kategorien', group: 'Bewertung', skippable: false },
  { id: 'facilitiesInside', label: 'Einrichtungen innen', group: 'Details', skippable: true },
  { id: 'facilitiesNearby', label: 'Einrichtungen Nähe', group: 'Details', skippable: true },
  { id: 'demographics', label: 'Persönliche Angaben', group: 'Details', skippable: true },
  { id: 'suitableFor', label: 'Geeignet für', group: 'Details', skippable: true },
  { id: 'title', label: 'Titel', group: 'Freitext', skippable: false },
  { id: 'reviewText', label: 'Bewertungstext', group: 'Freitext', skippable: false },
  { id: 'summary', label: 'Zusammenfassung', group: 'Abschluss', skippable: false },
  { id: 'submit', label: 'Absenden', group: 'Abschluss', skippable: false },
]

const GROUPS = ['Verifizierung', 'Hinweis', 'Grunddaten', 'Bewertung', 'Details', 'Freitext', 'Abschluss']

// ── Animation Variants ──────────────────────────────────────────────────────

const stepVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? '100%' : '-100%',
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? '-100%' : '100%',
    opacity: 0,
  }),
}

const stepTransition = {
  x: { type: 'spring', stiffness: 300, damping: 30 },
  opacity: { duration: 0.2 },
}

// ── Props ───────────────────────────────────────────────────────────────────

interface RatingWizardProps {
  projectId: string
  onComplete: (data: WizardFormData) => void
  onCancel: () => void
  onSubmit: (data: WizardFormData) => Promise<void>
  onVerify: (code: string) => Promise<void>
  onResendCode: () => Promise<void>
  verificationError?: string | null
  onSendEmailCode: (email: string) => Promise<boolean>
  onVerifyEmailCode: (code: string) => Promise<boolean>
  onResendEmailCode: () => Promise<boolean>
  emailVerificationError?: string | null
  isEmailSending?: boolean
  isEmailVerifying?: boolean
}

// ── Component ───────────────────────────────────────────────────────────────

export default function RatingWizard({
  onCancel,
  onSubmit,
  onVerify,
  onResendCode,
  verificationError = null,
  onSendEmailCode,
  onVerifyEmailCode,
  onResendEmailCode,
  emailVerificationError = null,
  isEmailSending = false,
  isEmailVerifying = false,
}: RatingWizardProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [direction, setDirection] = useState(1)
  const [formData, setFormData] = useState<WizardFormData>(INITIAL_FORM_DATA)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [showVerification, setShowVerification] = useState(false)
  const [showEmailVerificationModal, setShowEmailVerificationModal] = useState(false)
  const [emailVerified, setEmailVerified] = useState(false)

  const totalSteps = STEPS.length
  const step = STEPS[currentStep]

  // ── Navigation ──────────────────────────────────────────────────────────

  const goNext = useCallback(() => {
    if (currentStep < totalSteps - 1) {
      setDirection(1)
      setCurrentStep((s) => s + 1)
    }
  }, [currentStep, totalSteps])

  const goBack = useCallback(() => {
    if (currentStep > 0) {
      setDirection(-1)
      setCurrentStep((s) => s - 1)
    } else {
      onCancel()
    }
  }, [currentStep, onCancel])

  const goSkip = useCallback(() => {
    goNext()
  }, [goNext])

  const goToStep = useCallback((stepId: string) => {
    const index = STEPS.findIndex((s) => s.id === stepId)
    if (index !== -1) {
      setDirection(index > currentStep ? 1 : -1)
      setCurrentStep(index)
    }
  }, [currentStep])

  // ── Submit Handler ──────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true)
    try {
      await onSubmit(formData)
      setShowVerification(true)
    } catch {
      // Error handling delegated to parent
    } finally {
      setIsSubmitting(false)
    }
  }, [formData, onSubmit])

  const handleVerify = useCallback(async (code: string) => {
    setIsVerifying(true)
    try {
      await onVerify(code)
      setShowVerification(false)
    } catch {
      // Error shown via verificationError prop
    } finally {
      setIsVerifying(false)
    }
  }, [onVerify])

  const handleResendCode = useCallback(async () => {
    await onResendCode()
  }, [onResendCode])

  // ── Progress Calculation ────────────────────────────────────────────────

  const currentGroup = step.group
  const currentGroupIndex = GROUPS.indexOf(currentGroup)

  const getGroupProgress = (groupName: string): 'completed' | 'active' | 'pending' => {
    const groupIndex = GROUPS.indexOf(groupName)
    if (groupIndex < currentGroupIndex) return 'completed'
    if (groupIndex === currentGroupIndex) return 'active'
    return 'pending'
  }

  const getActiveGroupFill = (): number => {
    const groupSteps = STEPS.filter((s) => s.group === currentGroup)
    const firstIndex = STEPS.findIndex((s) => s.group === currentGroup)
    const positionInGroup = currentStep - firstIndex
    return ((positionInGroup + 1) / groupSteps.length) * 100
  }

  // ── Step Rendering ──────────────────────────────────────────────────────

  const renderStep = () => {
    switch (step.id) {
      case 'notice':
        return <StepNotice onNext={goNext} onBack={goBack} />

      case 'period':
        return (
          <StepPeriod
            value={formData.period}
            onChange={(v) => setFormData((d) => ({ ...d, period: v }))}
            onNext={goNext}
            onBack={goBack}
          />
        )

      case 'stayType':
        return (
          <StepStayType
            value={formData.stayType}
            onChange={(v) => setFormData((d) => ({ ...d, stayType: v }))}
            onNext={goNext}
            onBack={goBack}
          />
        )

      case 'impression':
        return (
          <StepImpression
            value={formData.impression}
            onChange={(v) => setFormData((d) => ({ ...d, impression: v }))}
            onNext={goNext}
            onBack={goBack}
          />
        )

      case 'categories':
        return (
          <StepCategories
            value={formData.categories}
            onChange={(v) => setFormData((d) => ({ ...d, categories: v }))}
            onNext={goNext}
            onBack={goBack}
          />
        )

      case 'facilitiesInside':
        return (
          <StepFacilitiesInside
            value={formData.facilitiesInside}
            onChange={(v) => setFormData((d) => ({ ...d, facilitiesInside: v }))}
            onNext={goNext}
            onBack={goBack}
            onSkip={goSkip}
          />
        )

      case 'facilitiesNearby':
        return (
          <StepFacilitiesNearby
            value={formData.facilitiesNearby}
            onChange={(v) => setFormData((d) => ({ ...d, facilitiesNearby: v }))}
            onNext={goNext}
            onBack={goBack}
            onSkip={goSkip}
          />
        )

      case 'demographics':
        return (
          <StepDemographics
            value={formData.demographics}
            onChange={(v) => setFormData((d) => ({ ...d, demographics: v }))}
            onNext={goNext}
            onBack={goBack}
            onSkip={goSkip}
          />
        )

      case 'suitableFor':
        return (
          <StepSuitableFor
            value={formData.suitableFor}
            onChange={(v) => setFormData((d) => ({ ...d, suitableFor: v }))}
            onNext={goNext}
            onBack={goBack}
            onSkip={goSkip}
          />
        )

      case 'title':
        return (
          <StepTitle
            value={formData.title}
            onChange={(v) => setFormData((d) => ({ ...d, title: v }))}
            onNext={goNext}
            onBack={goBack}
          />
        )

      case 'reviewText':
        return (
          <StepReviewText
            value={formData.reviewText}
            onChange={(v) => setFormData((d) => ({ ...d, reviewText: v }))}
            onNext={goNext}
            onBack={goBack}
          />
        )

      case 'summary':
        return (
          <StepSummary
            value={formData}
            onNext={goNext}
            onBack={goBack}
            onGoToStep={goToStep}
          />
        )

      case 'submit':
        return (
          <StepSubmit
            value={formData.submit}
            onChange={(v) => setFormData((d) => ({ ...d, submit: v }))}
            onSubmit={handleSubmit}
            onBack={goBack}
            isSubmitting={isSubmitting}
          />
        )

      default:
        return null
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border">
        <div className="flex items-center justify-between px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1.5 text-sm text-txt-secondary hover:text-txt-primary transition-colors"
            aria-label="Wizard schließen"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            <span className="hidden sm:inline">Abbrechen</span>
          </button>
          <h1 className="text-sm font-semibold text-txt-primary">Bewertung schreiben</h1>
          <span className="text-xs font-medium text-txt-muted tabular-nums">
            {currentStep + 1} / {totalSteps}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="px-4 pb-3 sm:px-6">
          <div className="flex gap-1">
            {GROUPS.map((group) => {
              const status = getGroupProgress(group)
              const groupSteps = STEPS.filter((s) => s.group === group)
              const widthPercent = (groupSteps.length / totalSteps) * 100
              const firstIndex = STEPS.findIndex((s) => s.group === group)
              const positionInGroup = currentStep - firstIndex

              const segmentCurrent =
                status === 'completed'
                  ? groupSteps.length
                  : status === 'active'
                    ? positionInGroup + 1
                    : 0

              return (
                <div key={group} style={{ width: `${widthPercent}%` }} title={group}>
                  <ProgressBar
                    currentStep={segmentCurrent}
                    totalSteps={groupSteps.length}
                    size="sm"
                  />
                </div>
              )
            })}
          </div>
          <div className="flex gap-1 mt-1.5">
            {GROUPS.map((group) => {
              const status = getGroupProgress(group)
              const groupSteps = STEPS.filter((s) => s.group === group)
              const widthPercent = (groupSteps.length / totalSteps) * 100

              return (
                <span
                  key={group}
                  className={`text-[10px] truncate ${
                    status === 'active'
                      ? 'text-accent font-semibold'
                      : status === 'completed'
                        ? 'text-txt-secondary font-medium'
                        : 'text-txt-muted'
                  }`}
                  style={{ width: `${widthPercent}%` }}
                >
                  {group}
                </span>
              )
            })}
          </div>
        </div>
      </div>

      {/* Step Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[640px] mx-auto px-4 py-6 sm:px-8 sm:py-8">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step.id}
              custom={direction}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={stepTransition}
            >
              {renderStep()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Verification Modal */}
      <StepVerificationModal
        isOpen={showVerification}
        onVerify={handleVerify}
        onResendCode={handleResendCode}
        onClose={() => setShowVerification(false)}
        isVerifying={isVerifying}
        error={verificationError}
      />
    </div>
  )
}

export type { WizardFormData, RatingWizardProps }
