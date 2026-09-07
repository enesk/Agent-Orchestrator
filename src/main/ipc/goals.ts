import * as goals from '../goals'
import type { DomainHandlers } from './registry'

export const goalsHandlers: DomainHandlers<'goals'> = {
  list: ({ projectId }) => goals.list(projectId),
  get: ({ id }) => goals.get(id),
  startFromDescription: (input) => goals.startFromDescription(input),
  startFromTickets: (input) => goals.startFromTickets(input),
  cancel: ({ id }) => goals.cancel(id),
  retry: ({ id }) => goals.retry(id),
  log: ({ goalId, limit }) => goals.logEntries(goalId, limit),
}
