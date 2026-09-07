import { useState, useEffect, useCallback } from 'react'
import { useIpc } from './useIpc'
import type { Rating } from '@shared/types'
import type { WizardFormData } from '../components/RatingWizard'

export function useRatings(projectId: string | null) {
  const ipc = useIpc()
  const [ratings, setRatings] = useState<Rating[]>([])
  const [loading, setLoading] = useState(false)
  const [activeRatingId, setActiveRatingId] = useState<string | null>(null)
  const [verificationError, setVerificationError] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId) {
      setRatings([])
      return
    }
    setLoading(true)
    ipc.ratings.getAll(projectId)
      .then(setRatings)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectId])

  useEffect(() => {
    const unsub = ipc.ratings.onUpdate((data) => {
      if (data.type === 'submitted' && data.rating) {
        setRatings((prev) => [data.rating!, ...prev])
      } else if (data.type === 'verified' && data.rating) {
        setRatings((prev) => prev.map((r) => r.id === data.rating!.id ? data.rating! : r))
      } else if (data.type === 'deleted' && data.ratingId) {
        setRatings((prev) => prev.filter((r) => r.id !== data.ratingId))
      }
    })
    return unsub
  }, [])

  const submitRating = useCallback(async (formData: WizardFormData) => {
    if (!projectId) throw new Error('Kein Projekt ausgewählt')

    const result = await ipc.ratings.submit({
      projectId,
      period: formData.period!,
      stayType: formData.stayType!,
      impression: formData.impression,
      categories: formData.categories,
      facilitiesInside: formData.facilitiesInside,
      facilitiesNearby: formData.facilitiesNearby,
      title: formData.title,
      firstName: formData.submit.firstName,
      email: formData.submit.email,
      consent: formData.submit.consent,
      demographics: formData.demographics,
    })

    if (!result.success) {
      throw new Error(result.errors?.join(', ') || 'Fehler beim Absenden')
    }

    setActiveRatingId(result.ratingId!)
    return result
  }, [ipc, projectId])

  const verifyRating = useCallback(async (code: string) => {
    if (!activeRatingId) throw new Error('Keine aktive Bewertung')
    setVerificationError(null)

    const result = await ipc.ratings.verify(activeRatingId, code)
    if (!result.success) {
      setVerificationError(result.error || 'Verifizierung fehlgeschlagen')
      throw new Error(result.error)
    }

    setActiveRatingId(null)
    return result
  }, [ipc, activeRatingId])

  const resendVerification = useCallback(async () => {
    if (!activeRatingId) throw new Error('Keine aktive Bewertung')
    setVerificationError(null)
    await ipc.ratings.resendVerification(activeRatingId)
  }, [ipc, activeRatingId])

  const deleteRating = useCallback(async (ratingId: string) => {
    setRatings((prev) => prev.filter((r) => r.id !== ratingId))
    await ipc.ratings.delete(ratingId)
  }, [ipc])

  return {
    ratings,
    loading,
    activeRatingId,
    verificationError,
    submitRating,
    verifyRating,
    resendVerification,
    deleteRating,
  }
}
