import React, { useMemo, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ProjectAgent } from '@shared/types'
import MentionChip from './MentionChip'

const COLLAPSE_LINE_THRESHOLD = 10

function CollapsiblePre({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) {
  const [open, setOpen] = useState(false)

  const codeText = useMemo(() => {
    const extract = (node: React.ReactNode): string => {
      if (typeof node === 'string') return node
      if (!node) return ''
      if (Array.isArray(node)) return node.map(extract).join('')
      if (typeof node === 'object' && 'props' in node) {
        return extract((node as React.ReactElement).props.children)
      }
      return ''
    }
    return extract(children)
  }, [children])

  const lines = codeText.split('\n')
  const lineCount = lines[lines.length - 1] === '' ? lines.length - 1 : lines.length

  if (lineCount <= COLLAPSE_LINE_THRESHOLD) {
    return <pre {...props}>{children}</pre>
  }

  const toggle = useCallback(() => setOpen((v) => !v), [])

  return (
    <details className="collapsible-code" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary onClick={(e) => { e.preventDefault(); toggle() }}>
        <span className="collapsible-code-label">Code Output</span>
        <span className="collapsible-code-lines">{lineCount} Zeilen</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`collapsible-chevron ${open ? 'open' : ''}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </summary>
      <pre {...props}>{children}</pre>
    </details>
  )
}

interface Props {
  content: string
  agents: ProjectAgent[]
  streaming?: boolean
}

/**
 * Closes any unclosed markdown constructs so partial streaming
 * content renders cleanly without visual glitches.
 */
function sanitizeStreamingMarkdown(text: string): string {
  let result = text

  // Close unclosed fenced code blocks (``` or ~~~)
  const fenceMatches = result.match(/^(`{3,}|~{3,})/gm)
  if (fenceMatches && fenceMatches.length % 2 !== 0) {
    result += '\n' + fenceMatches[fenceMatches.length - 1]
  }

  // Close unclosed inline code (odd number of backticks not part of fences)
  const lines = result.split('\n')
  const lastLine = lines[lines.length - 1]
  if (lastLine && !lastLine.startsWith('```') && !lastLine.startsWith('~~~')) {
    const backtickCount = (lastLine.match(/`/g) || []).length
    if (backtickCount % 2 !== 0) {
      result += '`'
    }
  }

  // Close unclosed bold/italic markers on the last line
  const trailingBold = (lastLine?.match(/\*\*/g) || []).length
  if (trailingBold % 2 !== 0) {
    result += '**'
  }
  const trailingItalic = (lastLine?.match(/(?<!\*)\*(?!\*)/g) || []).length
  if (trailingItalic % 2 !== 0) {
    result += '*'
  }

  return result
}

/**
 * Splits message content into text segments and @mentions,
 * then renders text segments as Markdown via react-markdown.
 * During streaming, incomplete markdown constructs are auto-closed.
 */
export default function MarkdownMessage({ content, agents, streaming = false }: Props) {
  const segments = useMemo(() => {
    const parts = content.split(/(@[a-zA-Z0-9_-]+)/g)
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        const agent = agents.find(
          (a) => a.mentionKey.toLowerCase() === part.toLowerCase()
        )
        if (agent) {
          return { type: 'mention' as const, key: i, agent, text: part }
        }
      }
      return { type: 'text' as const, key: i, text: part }
    })
  }, [content, agents])

  return (
    <div className="markdown-body">
      {segments.map((seg) => {
        if (seg.type === 'mention') {
          return <MentionChip key={seg.key} name={`@${seg.agent!.name}`} color={seg.agent!.color} />
        }
        if (!seg.text) return null
        const md = streaming ? sanitizeStreamingMarkdown(seg.text) : seg.text
        return (
          <ReactMarkdown key={seg.key} remarkPlugins={[remarkGfm]} components={{ pre: CollapsiblePre }}>
            {md}
          </ReactMarkdown>
        )
      })}
    </div>
  )
}
