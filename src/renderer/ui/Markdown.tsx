import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from './cn'

export interface MarkdownProps {
  content: string
  className?: string
  /** Ersetzt einzelne Knoten, z.B. Codeblöcke mit Kopier-Knopf im Chat. */
  components?: Components
}

/** Einheitliche Markdown-Darstellung für Tickets, Kommentare und Dokumente. */
export function Markdown({ content, className, components }: MarkdownProps) {
  return (
    <div
      className={cn(
        'text-sm leading-relaxed text-ink',
        '[&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-base [&_h1]:font-semibold',
        '[&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-sm [&_h2]:font-semibold',
        '[&_h3]:mb-1 [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-medium',
        '[&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5',
        '[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5',
        '[&_a]:text-accent [&_a]:underline',
        '[&_code]:rounded [&_code]:bg-raised [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px]',
        '[&_pre]:my-2 [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-line [&_pre]:bg-raised [&_pre]:p-3',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
        '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-line-strong [&_blockquote]:pl-3 [&_blockquote]:text-ink-muted',
        '[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse',
        '[&_th]:border [&_th]:border-line [&_th]:bg-raised [&_th]:px-2 [&_th]:py-1 [&_th]:text-left',
        '[&_td]:border [&_td]:border-line [&_td]:px-2 [&_td]:py-1',
        '[&_hr]:my-3 [&_hr]:border-line',
        '[&_img]:max-w-full [&_img]:rounded',
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
