import { cn } from '../../ui'
import { initials } from './agentHelpers'

export interface AgentAvatarProps {
  name: string
  color: string
  avatar: string | null
  size?: 'sm' | 'md'
  className?: string
}

export function AgentAvatar({ name, color, avatar, size = 'md', className }: AgentAvatarProps) {
  const label = avatar?.trim() || initials(name)
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: `${color}26`, color, borderColor: `${color}66` }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md border font-semibold',
        size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs',
        className,
      )}
    >
      {label}
    </span>
  )
}
