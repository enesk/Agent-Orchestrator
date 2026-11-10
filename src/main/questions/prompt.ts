import type { AgentQuestion } from '@shared/types'

/**
 * Die Textbausteine der Rückfragen — reine Funktionen über ihre Eingabe, ohne Datenbank und
 * ohne `electron`. Der Wortlaut der Abgrenzung zu FEAT-15 steht hier an einer Stelle und
 * geht von hier aus in den Werkzeugtext, in den Zurückhaltungsblock und in den Worker-Prompt.
 */

/**
 * Die Beschreibung von `ask_user`. Sie muss zwei Dinge gleich scharf sagen: dass der Lauf
 * danach endet, und wann Fragen überhaupt erlaubt sind. Ohne den zweiten Teil wird aus dem
 * Werkzeug der bequemste Weg, Arbeit abzuwälzen — genau das, was FEAT-15 abgestellt hat.
 */
export const ASK_USER_DESCRIPTION = `Stellt dem Nutzer eine Rückfrage und hinterlässt sie als \
offene Frage. **Dein Lauf endet danach** — du wartest nicht, du bekommst in diesem Lauf keine \
Antwort mehr, und du rufst danach kein weiteres Werkzeug auf. Sobald der Nutzer antwortet, \
wirst du mit Frage und Antwort erneut gestartet und arbeitest dort weiter.

Benutze dieses Werkzeug nur für eine Entscheidung, die du nicht treffen darfst: eine Abwägung \
mit Folgen für den Nutzer, die sich nicht zurücknehmen lässt oder nach außen wirkt — etwas \
veröffentlichen, zusammenführen, löschen, verschicken, Kosten auslösen, einen Termin absagen. \
Erlaubt wäre: „Soll ich den Termin am Dienstag verschieben oder absagen?"

Nicht erlaubt ist alles, was du selbst herausfinden oder entscheiden kannst. „Welche Datei soll \
ich ändern?" steht in der Aufgabe oder ist zu finden — das fragst du nicht, das recherchierst \
du. Bei mehreren vertretbaren technischen Wegen wählst du den, der am wenigsten kaputt macht, \
und hältst deine Annahme fest. Eine Frage ist kein Ersatz für Arbeit und keine Absicherung.`

/** Der Absatz für den Zurückhaltungsblock — kurz, weil das Werkzeug sich selbst beschreibt. */
export const ASK_USER_RESTRAINT_LINES: readonly string[] = [
  '- **Keine Rückfragen, außer du darfst nicht selbst entscheiden.** Du fragst nicht nach',
  '  Bestätigung und wartest nie auf Rückmeldung. Die eine Ausnahme ist `ask_user`, und die',
  '  gilt nur für eine Entscheidung, die dir nicht zusteht: etwas Unumkehrbares oder nach',
  '  außen Wirkendes — veröffentlichen, zusammenführen, löschen, verschicken, Kosten',
  '  auslösen. Dein Lauf endet mit dieser Frage; du wirst mit der Antwort erneut gestartet.',
  '  Alles, was du selbst herausfinden oder abwägen kannst, entscheidest du selbst und hältst',
  '  die Annahme fest.',
]

/** Was der Agent nach dem Aufruf zurückbekommt. Er soll danach wirklich aufhören. */
export function askAcceptedText(question: AgentQuestion): string {
  const lines = [
    'Die Frage ist beim Nutzer hinterlegt.',
    '',
    'Beende jetzt deinen Lauf. Ruf kein weiteres Werkzeug auf, fang nichts Neues an und rate',
    'nicht. Fasse in einem Satz zusammen, worauf du wartest — mehr nicht. Sobald der Nutzer',
    'antwortet, wirst du mit Frage und Antwort erneut gestartet.',
  ]
  if (question.ticketId) {
    lines.push(
      '',
      'Das Ticket bleibt bis dahin in Arbeit. Setze es **nicht** auf „done" und melde es nicht',
      'als blockiert.',
    )
  }
  return lines.join('\n')
}

/** Der Auftrag des wieder aufgenommenen Laufs. Frage und Antwort stehen wörtlich darin. */
export function buildAnswerPrompt(question: AgentQuestion): string {
  const lines = [
    '# Antwort auf deine Rückfrage',
    '',
    'Du hast diesen Lauf mit einer Rückfrage beendet. Hier ist die Antwort des Nutzers.',
    '',
    '## Deine Frage',
    '',
    question.question.trim(),
  ]

  const context = question.context?.trim()
  if (context) {
    lines.push('', 'Dein Kontext dazu war:', '', context)
  }

  lines.push(
    '',
    '## Antwort des Nutzers',
    '',
    question.answer?.trim() || '(keine Antwort)',
    '',
    '## Auftrag',
    '',
    'Arbeite genau dort weiter, wo du aufgehört hast, und richte dich nach dieser Antwort.',
    'Sie ist die Entscheidung — frage nicht erneut nach demselben Punkt und weiche nicht davon',
    'ab. Was darin nicht beantwortet ist, entscheidest du selbst.',
  )

  return lines.join('\n')
}

/** Der Auftrag, wenn die Frist abgelaufen ist, ohne dass jemand geantwortet hat. */
export function buildExpiredPrompt(question: AgentQuestion): string {
  return [
    '# Deine Rückfrage blieb unbeantwortet',
    '',
    'Du hast gefragt:',
    '',
    question.question.trim(),
    '',
    'Darauf hat in sieben Tagen niemand geantwortet; die Frage ist geschlossen.',
    '',
    '## Auftrag',
    '',
    'Frage nicht erneut. Wähle den Weg, der am wenigsten kaputt macht und sich am leichtesten',
    'zurücknehmen lässt — tu insbesondere **nichts** Unumkehrbares und nichts, das nach außen',
    'wirkt. Lässt sich die Aufgabe ohne diese Entscheidung nicht sinnvoll beenden, halte',
    'schriftlich fest, woran es liegt, und beende den Lauf.',
  ].join('\n')
}
