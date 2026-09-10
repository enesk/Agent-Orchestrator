import type { ReactNode } from 'react'
import type { MessageAttachment } from '@shared/types'
import { cn } from '../../ui'
import { AttachmentTile } from './AttachmentTile'
import { attachmentUrl, kindOf } from './attachmentHelpers'
import { useAttachmentViewer } from './useAttachmentViewer'

export interface AttachmentListProps {
  attachments: MessageAttachment[]
  onRemove?: (attachment: MessageAttachment) => void
  /** `large` zeigt Bilder in Originalseitenverhältnis — so wie im Nachrichtenverlauf. */
  imagePreview?: 'tile' | 'large'
  className?: string
  children?: ReactNode
}

/** Kacheln gespeicherter Anhänge samt Vorschau — überall dort, wo Anhänge auftauchen. */
export function AttachmentList({
  attachments,
  onRemove,
  imagePreview,
  className,
  children,
}: AttachmentListProps) {
  const { open, viewer } = useAttachmentViewer()
  if (attachments.length === 0 && !children) return null

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {attachments.map((attachment) => (
        <AttachmentTile
          key={attachment.id}
          fileName={attachment.fileName}
          size={attachment.size}
          kind={kindOf(attachment)}
          previewUrl={attachmentUrl(attachment)}
          imagePreview={imagePreview}
          onOpen={() => open(attachment)}
          onRemove={onRemove ? () => onRemove(attachment) : undefined}
        />
      ))}
      {children}
      {viewer}
    </div>
  )
}
