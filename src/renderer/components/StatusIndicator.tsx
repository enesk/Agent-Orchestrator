import React from 'react'

interface Props {
  status: 'connected' | 'connecting' | 'disconnected'
  size?: 'sm' | 'md' | 'lg'
  label?: string
}

const sizeMap = {
  sm: { dot: 'w-1.5 h-1.5', text: 'text-xs' },
  md: { dot: 'w-2 h-2', text: 'text-sm' },
  lg: { dot: 'w-2.5 h-2.5', text: 'text-base' },
}

const statusConfig = {
  connected: {
    dotColor: 'bg-status-success',
    labelColor: 'text-status-success',
  },
  connecting: {
    dotColor: 'bg-status-warning',
    labelColor: 'text-status-warning',
  },
  disconnected: {
    dotColor: 'bg-status-error',
    labelColor: 'text-txt-muted',
  },
}

export default function StatusIndicator({ status, size = 'md', label }: Props) {
  const s = sizeMap[size]
  const cfg = statusConfig[status]

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex items-center justify-center">
        {/* Pulse ring for connected */}
        {status === 'connected' && (
          <div className={`absolute ${s.dot} rounded-full bg-status-success/30 animate-ping`} />
        )}

        {/* Spinning ring for connecting */}
        {status === 'connecting' && (
          <div
            className="absolute rounded-full border border-status-warning border-t-transparent animate-spin"
            style={{ width: `calc(100% + 4px)`, height: `calc(100% + 4px)` }}
          />
        )}

        {/* Core dot */}
        <div className={`${s.dot} rounded-full ${cfg.dotColor}`} />
      </div>
      {label && (
        <span className={`${s.text} ${cfg.labelColor} font-medium`}>{label}</span>
      )}
    </div>
  )
}
