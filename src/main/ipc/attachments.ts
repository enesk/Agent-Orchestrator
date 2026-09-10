import { shell } from 'electron'
import { getAttachmentsRoot } from '../app/attachments'
import { resolveAttachmentPath } from '../app/attachment-path'
import { getAttachment } from '../db/repositories/messages'
import type { DomainHandlers } from './registry'

export const attachmentsHandlers: DomainHandlers<'attachments'> = {
  open: async (input) => {
    const attachment = getAttachment(input.attachmentId)
    if (!attachment) throw new Error('Der Anhang existiert nicht mehr.')

    // Der Pfad aus der Datenbank wird genauso geprüft wie eine `attachment://`-Anfrage —
    // ein manipulierter Eintrag darf nichts außerhalb des Anhang-Verzeichnisses öffnen.
    const resolved = resolveAttachmentPath(getAttachmentsRoot(), attachment.relativePath)
    if (!resolved) throw new Error('Der Anhang liegt außerhalb des Anhang-Verzeichnisses.')

    const failure = await shell.openPath(resolved)
    if (failure) throw new Error(`Die Datei konnte nicht geöffnet werden: ${failure}`)
    return { ok: true }
  },
}
