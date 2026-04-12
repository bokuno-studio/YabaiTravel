import { useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { CalendarIcon, SlidersHorizontal, X } from 'lucide-react'

export interface FiltersSidebarProps {
  availableCountries: string[]
  countries: Set<string>
  onCountryToggle: (country: string) => void
  availableRaceTypes: string[]
  raceTypes: Set<string>
  onRaceTypeToggle: (type: string) => void
  raceTypeLabel: (type: string | null) => string
  dateRangeStart: string | null
  dateRangeEnd: string | null
  onDateRangeChange: (start: string | null, end: string | null) => void
  distanceRanges: Set<number>
  onDistanceRangeToggle: (idx: number) => void
  distanceRangeOptions: readonly { label: string; min: number; max: number }[]
  entryOpenOnly: boolean
  onEntryOpenOnlyChange: (value: boolean) => void
  t: (key: string, options?: Record<string, unknown>) => string
  lang: string | undefined
}

const toLocalDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

function formatShortDate(dateStr: string, lang: string | undefined): string {
  const date = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(date.getTime())) return dateStr
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function countActiveFilters(props: FiltersSidebarProps): number {
  let count = 0
  if (props.dateRangeStart || props.dateRangeEnd) count++
  if (props.countries.size > 0) count++
  if (props.raceTypes.size > 0) count++
  if (props.distanceRanges.size > 0) count++
  if (!props.entryOpenOnly) count++
  return count
}

export function getActiveFilterChips(
  props: FiltersSidebarProps,
): { key: string; label: string; onRemove: () => void }[] {
  const chips: { key: string; label: string; onRemove: () => void }[] = []

  if (props.dateRangeStart || props.dateRangeEnd) {
    const start = props.dateRangeStart ? formatShortDate(props.dateRangeStart, props.lang) : '...'
    const end = props.dateRangeEnd ? formatShortDate(props.dateRangeEnd, props.lang) : '...'
    chips.push({
      key: 'date-range',
      label: `${start} - ${end}`,
      onRemove: () => props.onDateRangeChange(null, null),
    })
  }

  for (const country of props.countries) {
    chips.push({
      key: `country-${country}`,
      label: country,
      onRemove: () => props.onCountryToggle(country),
    })
  }

  for (const type of props.raceTypes) {
    chips.push({
      key: `race-${type}`,
      label: props.raceTypeLabel(type),
      onRemove: () => props.onRaceTypeToggle(type),
    })
  }

  for (const idx of props.distanceRanges) {
    const range = props.distanceRangeOptions[idx]
    if (!range) continue
    chips.push({
      key: `distance-${idx}`,
      label: range.label,
      onRemove: () => props.onDistanceRangeToggle(idx),
    })
  }

  if (!props.entryOpenOnly) {
    chips.push({
      key: 'entry-open-only',
      label: props.lang === 'en' ? 'All entry statuses' : 'すべての受付状況',
      onRemove: () => props.onEntryOpenOnlyChange(true),
    })
  }

  return chips
}

function FiltersSheetBody(props: FiltersSidebarProps) {
  const isEn = props.lang === 'en'

  return (
    <div className="space-y-5 px-4 pb-6">
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {isEn ? 'Event date' : '開催日'}
        </h3>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'w-full justify-start text-left font-normal',
                !props.dateRangeStart && !props.dateRangeEnd && 'text-muted-foreground',
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {props.dateRangeStart || props.dateRangeEnd
                ? `${props.dateRangeStart ? formatShortDate(props.dateRangeStart, props.lang) : '...'} - ${props.dateRangeEnd ? formatShortDate(props.dateRangeEnd, props.lang) : '...'}`
                : (isEn ? 'Select date range' : '開催日を選択')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={{
                from: props.dateRangeStart ? new Date(`${props.dateRangeStart}T00:00:00`) : undefined,
                to: props.dateRangeEnd ? new Date(`${props.dateRangeEnd}T00:00:00`) : undefined,
              }}
              onSelect={(range: DateRange | undefined) => {
                props.onDateRangeChange(
                  range?.from ? toLocalDate(range.from) : null,
                  range?.to ? toLocalDate(range.to) : null,
                )
              }}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {isEn ? 'Country' : '国'}
        </h3>
        <div className="space-y-1.5">
          {props.availableCountries.map((country) => (
            <label
              key={country}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-secondary/50"
            >
              <input
                type="checkbox"
                checked={props.countries.has(country)}
                onChange={() => props.onCountryToggle(country)}
                className="h-4 w-4 rounded border-input text-primary accent-primary"
              />
              <span className="text-sm">{country}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {props.t('filter.raceType')}
        </h3>
        <div className="space-y-1.5">
          {props.availableRaceTypes.map((type) => (
            <label
              key={type}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-secondary/50"
            >
              <input
                type="checkbox"
                checked={props.raceTypes.has(type)}
                onChange={() => props.onRaceTypeToggle(type)}
                className="h-4 w-4 rounded border-input text-primary accent-primary"
              />
              <span className="text-sm">{props.raceTypeLabel(type)}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {props.t('filter.distance')}
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {props.distanceRangeOptions.map((range, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => props.onDistanceRangeToggle(idx)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                props.distanceRanges.has(idx)
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
              )}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {isEn ? 'Entry open only' : '受付中のみ'}
        </h3>
        <button
          type="button"
          role="switch"
          aria-checked={props.entryOpenOnly}
          onClick={() => props.onEntryOpenOnlyChange(!props.entryOpenOnly)}
          className={cn(
            'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors',
            props.entryOpenOnly ? 'border-primary bg-primary/5' : 'border-border bg-background',
          )}
        >
          <span>{isEn ? 'Show only open entries' : '受付中の大会だけ表示'}</span>
          <span
            className={cn(
              'inline-flex h-6 w-11 items-center rounded-full p-1 transition-colors',
              props.entryOpenOnly ? 'bg-primary' : 'bg-muted',
            )}
          >
            <span
              className={cn(
                'h-4 w-4 rounded-full bg-white transition-transform',
                props.entryOpenOnly ? 'translate-x-5' : 'translate-x-0',
              )}
            />
          </span>
        </button>
      </div>
    </div>
  )
}

export function FilterBar(props: FiltersSidebarProps) {
  const [open, setOpen] = useState(false)
  const activeChips = getActiveFilterChips(props)
  const activeCount = countActiveFilters(props)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {activeChips.length === 0 && (
            <span className="text-sm text-muted-foreground">
              {props.lang === 'en' ? 'Default filters applied' : 'デフォルト条件で表示中'}
            </span>
          )}
          {activeChips.map((chip) => (
            <Badge
              key={chip.key}
              variant="secondary"
              className="flex items-center gap-1 py-0.5 pl-2 pr-1 text-xs"
            >
              <span>{chip.label}</span>
              <button
                type="button"
                onClick={chip.onRemove}
                className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-destructive/20"
                aria-label={`Remove ${chip.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="shrink-0">
              <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
              {props.lang === 'en' ? 'Filters' : '絞り込み'}
              {activeCount > 0 && (
                <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                  {activeCount}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-80 overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{props.lang === 'en' ? 'Filters' : '絞り込み'}</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <FiltersSheetBody {...props} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  )
}

export function DetailedFilterSheet(props: FiltersSidebarProps) {
  return <FilterBar {...props} />
}

export function FiltersSidebar(props: FiltersSidebarProps) {
  return <FilterBar {...props} />
}
