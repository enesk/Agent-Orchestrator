import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { Components } from 'react-markdown'
import { useT } from '../../i18n'
import { Markdown } from '../../ui'

function CodeBlock({ children }: { children?: ReactNode }) {
  const t = useT()
  const preRef = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)

  async function copy(): Promise<void> {
    const text = preRef.current?.innerText ?? ''
    if (!text) return
    await navigator.clipboard.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="group/code relative">
      <pre ref={preRef} className="font-mono">
        {children}
      </pre>
      <button
        type="button"
        onClick={() => void copy()}
        className="absolute right-2 top-3.5 rounded border border-line bg-overlay px-1.5 py-0.5 text-[11px] text-ink-muted opacity-0 transition-opacity hover:text-ink group-hover/code:opacity-100 focus-visible:opacity-100"
      >
        {copied ? t('common.copied') : t('common.copy')}
      </button>
    </div>
  )
}

const COMPONENTS: Components = { pre: CodeBlock }

export interface MessageMarkdownProps {
  content: string
  className?: string
}

/**
 * Markdown einer Chat-Nachricht — wie überall, nur mit Kopier-Knopf an Codeblöcken.
 *
 * Das Ergebnis hängt am Inhalt: Rendert die Nachricht aus einem anderen Grund neu, wird das
 * Markdown nicht noch einmal geparst — das Teuerste, was die Liste tut.
 */
export function MessageMarkdown({ content, className }: MessageMarkdownProps) {
  return useMemo(
    () => <Markdown content={content} className={className} components={COMPONENTS} />,
    [content, className],
  )
}
