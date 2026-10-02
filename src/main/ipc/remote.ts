import { getStatus } from '../remote'
import type { DomainHandlers } from './registry'

export const remoteHandlers: DomainHandlers<'remote'> = {
  status: () => getStatus(),
}
