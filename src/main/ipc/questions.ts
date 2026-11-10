import * as questions from '../questions'
import type { DomainHandlers } from './registry'

export const questionsHandlers: DomainHandlers<'questions'> = {
  // Ohne `status` nur die offenen: das ist der Fall, für den es die Ansicht gibt.
  list: ({ projectId, status, limit }) =>
    questions.list({ projectId, status: status === undefined ? 'open' : status, limit }),
  openCount: ({ projectId }) => ({ count: questions.openCount(projectId) }),
  answer: ({ id, answer }) => questions.answer(id, answer),
  discard: ({ id }) => questions.discard(id),
}
