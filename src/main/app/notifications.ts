import { Notification } from 'electron'
import { getSettings, mainT } from './settings'
import { createMainWindow, getMainWindow } from './window'

export interface NotifyOptions {
  title: string
  body: string
  /** Beim Klick das Fenster nach vorne holen. */
  focusOnClick?: boolean
  /** Auch dann melden, wenn das Fenster gerade im Vordergrund ist. */
  whenFocused?: boolean
}

/**
 * Meldet etwas über die Systembenachrichtigung. Bewusst still, wenn der Nutzer ohnehin
 * hinschaut — sonst doppelt sich jede Meldung mit dem, was im Fenster passiert.
 */
export function notify(options: NotifyOptions): void {
  if (!getSettings().notificationsEnabled) return
  if (!Notification.isSupported()) return
  if (options.whenFocused !== true && getMainWindow()?.isFocused()) return

  const notification = new Notification({ title: options.title, body: options.body })
  if (options.focusOnClick !== false) {
    notification.on('click', () => {
      createMainWindow()
    })
  }
  notification.show()
}

/** Ein Agent ist mit seinem Lauf fertig. */
export function notifyAgentDone(agentName: string, summary: string): void {
  notify({ title: mainT()('main.notify.done', { name: agentName }), body: shorten(summary) })
}

/** Etwas ist schiefgegangen und der Nutzer sollte es erfahren, auch außerhalb des Fensters. */
export function notifyError(title: string, body: string): void {
  notify({ title, body: shorten(body) })
}

export interface NotifyQuestionInput {
  agentName: string
  question: string
  ticketNumber: number | null
}

/**
 * Ein Agent hat eine Rückfrage gestellt und wartet auf eine Antwort. Als einzige Meldung der
 * App **auch dann**, wenn das Fenster vorne ist: ein blockierter Lauf, den niemand bemerkt,
 * ist genau der Fall, den A3 abstellt — und der Nutzer kann in einem anderen Bereich stehen.
 */
export function notifyQuestion(input: NotifyQuestionInput): void {
  const t = mainT()
  notify({
    title:
      input.ticketNumber === null
        ? t('main.notify.question', { name: input.agentName })
        : t('main.notify.questionTicket', {
            name: input.agentName,
            number: input.ticketNumber,
          }),
    body: shorten(input.question),
    whenFocused: true,
  })
}

const MAX_BODY_LENGTH = 220

function shorten(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= MAX_BODY_LENGTH) return collapsed
  return `${collapsed.slice(0, MAX_BODY_LENGTH - 1).trimEnd()}…`
}
