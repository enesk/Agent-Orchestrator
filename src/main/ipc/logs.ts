import { logger } from '../Logger'
import type { DomainHandlers } from './registry'

export const logsHandlers: DomainHandlers<'logs'> = {
  recent: ({ limit }) => logger.recent(limit),
}
