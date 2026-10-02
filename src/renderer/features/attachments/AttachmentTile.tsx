import type { TranslationKey } from '@shared/i18n'
import { useFormat, useT } from '../../i18n'
import { cn } from '../../ui'
import {
  CloseIcon,
  CodeFileIcon,
  DocumentIcon,
  ImageIcon,
  MarkdownIcon,
  TableIcon,
} from '../../ui/icons'
import type { AttachmentKind } from './attachmentHelpers'

const KIND_ICONS = {
  image: ImageIcon,
  markdown: MarkdownIcon,
  html: CodeFileIcon,
  table: TableIcon,
  code: CodeFileIcon,
  document: DocumentIcon,
} as const

const KIND_LABEL_KEYS: Record<AttachmentKind, TranslationKey> = {
  image: 'attachment.kind.image',
  markdown: 'attachment.kind.markdown',
  html: 'attachment.kind.html',
  table: 'attachment.kind.table',
  code: 'attachment.kind.code',
  document: 'attachment.kind.document',
}

export interface AttachmentTileProps {
  fileName: string
  size: number
  kind: AttachmentKind
  /** Nur für Bilder — ohne Vorschau-Adresse zeigt auch ein Bild sein Symbol. */
  previewUrl?: string | null
  /**
   * `tile` ist das Quadrat neben den Dateikacheln, `large` das Bild in Originalseiten-
   * verhältnis, wie es im Nachrichtenverlauf steht.
   */
  imagePreview?: 'tile' | 'large'
  onOpen?: () => void
  onRemove?: () => void
  className?: string
}

/**
 * Eine Kachel je Anhang: Bilder als kleine Vorschau, alles andere als Symbol mit Name und
 * Größe. Gleiche Darstellung im Composer, am Ticket und im abgeschickten Verlauf.
 */
export function AttachmentTile({
  fileName,
  size,
  kind,
  previewUrl,
  imagePreview = 'tile',
  onOpen,
  onRemove,
  className,
}: AttachmentTileProps) {
  const t = useT()
  const format = useFormat()
  const KindIcon = KIND_ICONS[kind]
  const showsPreview = kind === 'image' && !!previewUrl

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        disabled={!onOpen}
        onClick={onOpen}
        title={`${fileName} · ${format.bytes(size)}`}
        className={cn(
          'flex items-center overflow-hidden rounded-md border border-line bg-raised text-left transition-colors',
          onOpen ? 'hover:border-line-strong' : 'cursor-default',
          !showsPreview && 'h-16 w-44 gap-2 px-2',
          showsPreview && (imagePreview === 'large' ? 'max-h-48 bg-transparent' : 'h-16 w-16'),
        )}
      >
        {showsPreview ? (
          <img
            src={previewUrl!}
            alt={fileName}
            className={cn(
              imagePreview === 'large' ? 'max-h-48 object-contain' : 'h-full w-full object-cover',
            )}
          />
        ) : (
          <>
            <KindIcon className="shrink-0 text-ink-muted" width={20} height={20} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs text-ink">{fileName}</span>
              <span className="block truncate text-[11px] text-ink-faint">
                {t(KIND_LABEL_KEYS[kind])} · {format.bytes(size)}
              </span>
            </span>
          </>
        )}
      </button>

      {onRemove && (
        <button
          type="button"
          aria-label={t('attachment.remove', { name: fileName })}
          onClick={onRemove}
          className="absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-line bg-overlay text-ink-muted hover:text-ink"
        >
          <CloseIcon width={11} height={11} />
        </button>
      )}
    </div>
  )
}
