import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Clock, ChevronDown } from 'lucide-react'
import { cn } from './utils'
import { generateTimeSlots, formatTime12h, parseTimeString } from './date-utils'

export interface TimePickerProps {
  /** Value as "HH:mm" (24h internal) */
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  /** Interval between slots in minutes (default 30) */
  interval?: number
  /** Display format (default '12h') */
  format?: '12h' | '24h'
  /** Minimum time "HH:mm" */
  minTime?: string
  /** Maximum time "HH:mm" */
  maxTime?: string
  disabled?: boolean
  className?: string
}

/**
 * TimePicker — scrollable list of time slots.
 *
 * The dropdown is rendered INLINE (not in a portal) on purpose. A portaled
 * Radix Popover, when opened from inside a Dialog, has its wheel events
 * swallowed by the Dialog's scroll-lock (react-remove-scroll) — you could drag
 * the scrollbar but the mouse wheel did nothing. Keeping the list in the
 * Dialog's own DOM subtree means the wheel scrolls it natively, everywhere.
 */
export function TimePicker({
  value = '',
  onChange,
  placeholder = 'Pick a time',
  interval = 30,
  format = '12h',
  minTime,
  maxTime,
  disabled,
  className,
}: TimePickerProps) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const slots = useMemo(() => generateTimeSlots(interval, minTime, maxTime), [interval, minTime, maxTime])

  const displayValue = value
    ? (format === '12h' ? formatTime12h(value) : value)
    : ''

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Scroll the selected (or nearest) slot into view when the list opens.
  useEffect(() => {
    if (!open || !listRef.current) return
    const raf = requestAnimationFrame(() => {
      const list = listRef.current
      if (!list) return
      const selected = list.querySelector<HTMLElement>('[data-selected="true"]')
      if (selected) {
        selected.scrollIntoView({ block: 'center' })
        return
      }
      if (!value) return
      const { hours, minutes } = parseTimeString(value)
      const totalMin = hours * 60 + minutes
      const nearestIdx = slots.reduce((best, slot, i) => {
        const { hours: sh, minutes: sm } = parseTimeString(slot)
        const slotMin = sh * 60 + sm
        const bestSlot = parseTimeString(slots[best])
        const bestMin = bestSlot.hours * 60 + bestSlot.minutes
        return Math.abs(slotMin - totalMin) < Math.abs(bestMin - totalMin) ? i : best
      }, 0)
      list.querySelectorAll('button')[nearestIdx]?.scrollIntoView({ block: 'center' })
    })
    return () => cancelAnimationFrame(raf)
  }, [open, value, slots])

  const handleSelect = useCallback((slot: string) => {
    onChange?.(slot)
    setOpen(false)
  }, [onChange])

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          !value && 'text-muted-foreground',
        )}
        data-testid="time-picker-trigger"
      >
        <span className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          {displayValue || placeholder}
        </span>
        <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 max-h-56 w-full overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {slots.map((slot) => {
            const isSelected = slot === value
            return (
              <button
                key={slot}
                type="button"
                role="option"
                aria-selected={isSelected}
                data-selected={isSelected}
                onClick={() => handleSelect(slot)}
                className={cn(
                  'w-full text-left px-3 py-1.5 text-sm rounded-md transition-colors',
                  isSelected
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-foreground hover:bg-accent',
                )}
              >
                {format === '12h' ? formatTime12h(slot) : slot}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
