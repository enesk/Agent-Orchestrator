import { listActiveRuns } from '../runs'
import type { DomainHandlers } from './registry'

export const runsHandlers: DomainHandlers<'runs'> = {
  /** Der Anfangsstand der Live-Übersicht; fortgeschrieben wird sie über die `run.*`-Ereignisse. */
  list: () => listActiveRuns(),
}
