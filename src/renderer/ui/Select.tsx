import type { SelectHTMLAttributes } from 'react'
import { cn } from './cn'
import { ChevronDownIcon } from './icons'

export interface SelectOption {
  value: string
  label: string
  group?: string
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string
  options: readonly SelectOption[]
}

export function Select({ label, options, className, id, ...props }: SelectProps) {
  const selectId = id ?? props.name
  const groups = groupOptions(options)

  return (
    <label className="block" htmlFor={selectId}>
      {label && <span className="mb-1 block text-xs font-medium text-ink-muted">{label}</span>}
      <div className="relative">
        <select
          id={selectId}
          className={cn(
            'h-9 w-full appearance-none rounded-md border border-line bg-surface pl-3 pr-8',
            'text-sm text-ink transition-colors focus:border-accent focus:outline-none',
            className,
          )}
          {...props}
        >
          {groups.map(([group, items]) =>
            group ? (
              <optgroup key={group} label={group}>
                {items.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ) : (
              items.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))
            ),
          )}
        </select>
        <ChevronDownIcon
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint"
          width={16}
          height={16}
        />
      </div>
    </label>
  )
}

function groupOptions(options: readonly SelectOption[]): [string | null, SelectOption[]][] {
  const result: [string | null, SelectOption[]][] = []
  for (const option of options) {
    const key = option.group ?? null
    const last = result[result.length - 1]
    if (last && last[0] === key) last[1].push(option)
    else result.push([key, [option]])
  }
  return result
}
