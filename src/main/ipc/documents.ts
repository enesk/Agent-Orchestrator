import * as documents from '../documents/DocumentService'
import type { DomainHandlers } from './registry'

export const documentsHandlers: DomainHandlers<'documents'> = {
  list: ({ projectId }) => documents.list(projectId),
  get: ({ id }) => documents.get(id),
  create: (input) => documents.create(input),
  update: ({ id, patch }) => documents.update(id, patch),
  remove: ({ id }) => {
    documents.remove(id)
    return { ok: true }
  },
}
