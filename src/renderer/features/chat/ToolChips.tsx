import type { ToolEvent } from '../../store/chatStore'
import { Spinner, cn } from '../../ui'

export interface ToolChipsProps {
  tools: ToolEvent[]
  className?: string
}

/**
 * Werkzeugaufrufe stehen als eigene Zeile über der Antwort — sie werden bewusst nicht in
 * den Antworttext geschrieben, damit der Text bleibt, was der Agent gesagt hat.
 */
export function ToolChips({ tools, className }: ToolChipsProps) {
  if (tools.length === 0) return null
  return (
    <div className={cn('mb-1 flex flex-wrap gap-1', className)}>
      {tools.map((tool) => (
        <span
          key={tool.id}
          className={cn(
            'inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[11px] leading-none',
            tool.done
              ? 'border-line bg-raised text-ink-faint'
              : 'border-info/40 bg-info/10 text-info',
          )}
        >
          {tool.done ? (
            <span className="h-1.5 w-1.5 rounded-full bg-ink-faint" />
          ) : (
            <Spinner size={9} />
          )}
          {tool.label}
        </span>
      ))}
    </div>
  )
}
