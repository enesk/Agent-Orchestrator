import { shell } from 'electron'
import { getAttachmentsRoot } from '../app/attachments'
import { resolveAttachmentPath } from '../app/attachment-path'
import { getAttachment } from '../db/repositories/messages'
import type { DomainHandlers } from './registry'
import { mainT } from '../app/settings'

export const attachmentsHandlers: DomainHandlers<'attachments'> = {
  open: async (input) => {
    const attachment = getAttachment(input.attachmentId)
    if (!attachment) throw new Error(mainT()('main.error.attachmentGone'))

    // Der Pfad aus der Datenbank wird genauso geprüft wie eine `attachment://`-Anfrage —
    // ein manipulierter Eintrag darf nichts außerhalb des Anhang-Verzeichnisses öffnen.
    const resolved = resolveAttachmentPath(getAttachmentsRoot(), attachment.relativePath)
    if (!resolved) throw new Error(mainT()('main.error.attachmentOutside'))

    const failure = await shell.openPath(resolved)
    if (failure) throw new Error(mainT()('main.error.attachmentOpen', { reason: failure }))
    return { ok: true }
  },
}
