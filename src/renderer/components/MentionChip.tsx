import React from 'react'

interface Props {
  name: string
  color: string
}

export default function MentionChip({ name, color }: Props) {
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-md px-2 py-0.5 text-sm font-semibold mx-0.5"
      style={{
        backgroundColor: color + '1A',
        color: color,
      }}
    >
      <span className="text-xs" style={{ color }}>@</span>
      {name.startsWith('@') ? name.slice(1) : name}
    </span>
  )
}
