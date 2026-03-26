import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SlidersHorizontal, X } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import PriceHistogramSlider from '@/components/PriceHistogramSlider'

export interface FiltersSidebarProps {
  /* Race type filter */
  availableRaceTypes: string[]
  raceTypes: Set<string>
  onRaceTypeToggle: (type: string) => void
  raceTypeLabel: (type: string | null) => string
  /* Category filter */
  availableCategories: string[]
  selectedCategories: Set<string>
  onCategoryToggle: (name: string) => void
  /* Month filter */
  availableMonths: string[]
  selectedMonths: Set<string>
  onMonthToggle: (month: string) => void
  /* Distance filter */
  distanceRanges: Set<number>
  onDistanceRangeToggle: (idx: number) => void
  distanceRangeOptions: readonly { label: string; min: number; max: number }[]
  /* Time limit filter */
  timeLimitMin: string
  onTimeLimitChange: (value: string) => void
  /* Cost filter */
  costPrices: number[]
  costMin: number
  costMax: number
  costGlobalMax: number
  onCostRangeChange: (min: number, max: number) => void
  /* Entry status filter */
  entryStatus: string
  onEntryStatusChange: (value: string) => void
  /* Pole filter */
  poleFilter: string
  onPoleFilterChange: (value: string) => void
  /* Past events */
  showPastEvents: boolean
  onShowPastEventsChange: (value: boolean) => void
  /* i18n */
  t: (key: string, options?: Record<string, unknown>) => string
  lang: string | undefined
}

/** Format year-month for display: "2026年3月" or "2026/03" */
export function formatYearMonth(ym: string, lang: string | undefined): string {
  const [year, month] = ym.split('-')
  const m = parseInt(month, 10)
  if (lang === 'en') return `${year}/${month}`
  return `${year}年${m}月`
}

/** Count active filters for badge display */
function countActiveFilters(props: FiltersSidebarProps): number {
  let count = 0
  if (props.raceTypes.size > 0) count++
  if (props.selectedMonths.size > 0) count++
  if (props.selectedCategories.size > 0) count++
  if (props.distanceRanges.size > 0) count++
  if (props.timeLimitMin) count++
  if (props.costMin > 0 || props.costMax < Infinity) count++
  if (props.poleFilter) count++
  if (props.entryStatus !== 'active') count++
  if (props.showPastEvents) count++
  return count
}

/** Build list of active filter chips for display */
export function getActiveFilterChips(props: FiltersSidebarProps): { key: string; label: string; onRemove: () => void }[] {
  const chips: { key: string; label: string; onRemove: () => void }[] = []

  // Race types
  for (const type of props.raceTypes) {
    chips.push({
      key: `race-${type}`,
      label: props.raceTypeLabel(type),
      onRemove: () => props.onRaceTypeToggle(type),
    })
  }

  // Months
  for (const ym of props.selectedMonths) {
    chips.push({
      key: `month-${ym}`,
      label: formatYearMonth(ym, props.lang),
      onRemove: () => props.onMonthToggle(ym),
    })
  }

  // Categories
  for (const name of props.selectedCategories) {
    chips.push({
      key: `cat-${name}`,
      label: name,
      onRemove: () => props.onCategoryToggle(name),
    })
  }

  // Distance ranges
  for (const idx of props.distanceRanges) {
    const range = props.distanceRangeOptions[idx]
    if (range) {
      chips.push({
        key: `dist-${idx}`,
        label: range.label,
        onRemove: () => props.onDistanceRangeToggle(idx),
      })
    }
  }

  // Time limit
  if (props.timeLimitMin) {
    chips.push({
      key: 'timelimit',
      label: props.t('filter.hoursOrMore', { hours: parseFloat(props.timeLimitMin) }),
      onRemove: () => props.onTimeLimitChange(''),
    })
  }

  // Cost
  if (props.costMin > 0 || props.costMax < Infinity) {
    const currency = props.lang === 'en' ? '$' : '¥'
    const minLabel = props.costMin > 0 ? `${currency}${props.costMin.toLocaleString()}` : ''
    const maxLabel = props.costMax < Infinity ? `${currency}${props.costMax.toLocaleString()}` : ''
    const label = minLabel && maxLabel
      ? `${minLabel}〜${maxLabel}`
      : minLabel
        ? `${minLabel}〜`
        : `〜${maxLabel}`
    chips.push({
      key: 'cost',
      label: `${props.lang === 'en' ? 'Cost' : 'コスト'}: ${label}`,
      onRemove: () => props.onCostRangeChange(0, Infinity),
    })
  }

  // Pole filter
  if (props.poleFilter) {
    const poleLabels: Record<string, string> = {
      allowed: props.t('filter.poleAllowed'),
      prohibited: props.t('filter.poleProhibited'),
    }
    chips.push({
      key: 'pole',
      label: poleLabels[props.poleFilter] || props.poleFilter,
      onRemove: () => props.onPoleFilterChange(''),
    })
  }

  // Entry status (only if not the default 'active')
  if (props.entryStatus !== 'active') {
    const statusLabels: Record<string, string> = {
      open: props.t('filter.entryOpen'),
      upcoming: props.t('filter.entryUpcoming'),
      closed: props.t('filter.entryClosed'),
      '': props.t('filter.entryAll'),
    }
    chips.push({
      key: 'entry',
      label: statusLabels[props.entryStatus] || props.entryStatus,
      onRemove: () => props.onEntryStatusChange('active'),
    })
  }

  // Past events
  if (props.showPastEvents) {
    chips.push({
      key: 'past',
      label: props.t('filter.showPast'),
      onRemove: () => props.onShowPastEventsChange(false),
    })
  }

  return chips
}

/** Unified filter bar: active filter chips + "絞り込み" button that opens a Sheet with ALL filters */
export function FilterBar(props: FiltersSidebarProps) {
  const [open, setOpen] = useState(false)
  const activeChips = getActiveFilterChips(props)
  const activeCount = countActiveFilters(props)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {/* Active filter chips */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {activeChips.length === 0 && (
            <span className="text-sm text-muted-foreground">
              {props.lang === 'en' ? 'No filters applied' : 'フィルターなし'}
            </span>
          )}
          {activeChips.map((chip) => (
            <Badge
              key={chip.key}
              variant="secondary"
              className="flex items-center gap-1 pl-2 pr-1 py-0.5 text-xs"
            >
              <span>{chip.label}</span>
              <button
                type="button"
                onClick={chip.onRemove}
                className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20 transition-colors"
                aria-label={`Remove ${chip.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>

        {/* Filter button with Sheet */}
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
            <div className="mt-4 space-y-5 px-4">
              {/* Race Type - multi-select checkboxes */}
              {props.availableRaceTypes.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {props.lang === 'en' ? 'Race Type' : 'レース種別'}
                  </h3>
                  <div className="space-y-1.5">
                    {props.availableRaceTypes.map((type) => (
                      <label
                        key={type}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-secondary/50 transition-colors"
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
              )}

              {/* Month - year-month multi-select checkboxes */}
              {props.availableMonths.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {props.lang === 'en' ? 'Month' : '開催月'}
                  </h3>
                  <div className="max-h-48 space-y-1.5 overflow-y-auto">
                    {props.availableMonths.map((ym) => (
                      <label
                        key={ym}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-secondary/50 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={props.selectedMonths.has(ym)}
                          onChange={() => props.onMonthToggle(ym)}
                          className="h-4 w-4 rounded border-input text-primary accent-primary"
                        />
                        <span className="text-sm">{formatYearMonth(ym, props.lang)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Category */}
              {props.availableCategories.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {props.t('filter.category')}
                  </h3>
                  <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                    {props.availableCategories.slice(0, 20).map((name) => (
                      <Badge
                        key={name}
                        variant={props.selectedCategories.has(name) ? 'default' : 'outline'}
                        className={cn(
                          'cursor-pointer select-none transition-all text-xs',
                          props.selectedCategories.has(name)
                            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                            : 'hover:bg-secondary',
                        )}
                        onClick={() => props.onCategoryToggle(name)}
                      >
                        {name}
                      </Badge>
                    ))}
                    {props.availableCategories.length > 20 && (
                      <span className="self-center text-xs text-muted-foreground">
                        {props.lang === 'en' ? `+${props.availableCategories.length - 20} more` : `他${props.availableCategories.length - 20}件`}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Distance */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {props.t('filter.distance')}
                </h3>
                <div className="flex flex-wrap gap-1">
                  {props.distanceRangeOptions.map((range, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => props.onDistanceRangeToggle(idx)}
                      className={cn(
                        'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
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

              {/* Time Limit */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {props.t('filter.timeLimit')}
                </h3>
                <select
                  value={props.timeLimitMin}
                  onChange={(e) => props.onTimeLimitChange(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
                >
                  <option value="">{props.t('filter.noLimit')}</option>
                  <option value="6">{props.t('filter.hoursOrMore', { hours: 6 })}</option>
                  <option value="12">{props.t('filter.hoursOrMore', { hours: 12 })}</option>
                  <option value="24">{props.t('filter.hoursOrMore', { hours: 24 })}</option>
                  <option value="36">{props.t('filter.hoursOrMore', { hours: 36 })}</option>
                </select>
              </div>

              {/* Cost */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {props.lang === 'en' ? 'Est. Cost' : 'コスト目安'}
                </h3>
                <PriceHistogramSlider
                  prices={props.costPrices}
                  min={props.costMin}
                  max={props.costMax >= Infinity ? props.costGlobalMax : props.costMax}
                  onRangeChange={(newMin, newMax) => {
                    props.onCostRangeChange(newMin, newMax >= props.costGlobalMax ? Infinity : newMax)
                  }}
                  currency={props.lang === 'en' ? '$' : '¥'}
                />
              </div>

              {/* Pole Filter */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {props.t('filter.poleFilter')}
                </h3>
                <select
                  value={props.poleFilter}
                  onChange={(e) => props.onPoleFilterChange(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
                >
                  <option value="">{props.t('filter.poleAll')}</option>
                  <option value="allowed">{props.t('filter.poleAllowed')}</option>
                  <option value="prohibited">{props.t('filter.poleProhibited')}</option>
                </select>
              </div>

              {/* Entry Status */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {props.t('filter.entryStatus')}
                </h3>
                <select
                  value={props.entryStatus}
                  onChange={(e) => props.onEntryStatusChange(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
                >
                  <option value="active">{props.t('filter.entryActive')}</option>
                  <option value="open">{props.t('filter.entryOpen')}</option>
                  <option value="upcoming">{props.t('filter.entryUpcoming')}</option>
                  <option value="closed">{props.t('filter.entryClosed')}</option>
                  <option value="">{props.t('filter.entryAll')}</option>
                </select>
              </div>

              {/* Show Past Events */}
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={props.showPastEvents}
                  onChange={(e) => props.onShowPastEventsChange(e.target.checked)}
                  className="h-4 w-4 rounded border-input text-primary accent-primary"
                />
                <span className="text-sm font-medium text-foreground">
                  {props.t('filter.showPast')}
                </span>
              </label>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  )
}

/** @deprecated Use FilterBar instead. Kept for backward compatibility. */
export function FilterChipBar({
  availableRaceTypes,
  raceTypes,
  onRaceTypeToggle,
  raceTypeLabel,
  availableMonths,
  selectedMonths,
  onMonthToggle,
}: Pick<FiltersSidebarProps, 'availableRaceTypes' | 'raceTypes' | 'onRaceTypeToggle' | 'raceTypeLabel' | 'availableMonths' | 'selectedMonths' | 'onMonthToggle'>) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-1 scrollbar-none">
      <div className="flex shrink-0 gap-1.5">
        {availableRaceTypes.map((type) => (
          <Badge
            key={type}
            variant={raceTypes.has(type) ? 'default' : 'outline'}
            className={cn(
              'cursor-pointer select-none whitespace-nowrap transition-all text-xs',
              raceTypes.has(type)
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'hover:bg-secondary',
            )}
            onClick={() => onRaceTypeToggle(type)}
          >
            {raceTypeLabel(type)}
          </Badge>
        ))}
      </div>
      {availableMonths.length > 0 && availableRaceTypes.length > 0 && (
        <div className="shrink-0 w-px bg-border" />
      )}
      <div className="flex shrink-0 gap-1">
        {availableMonths.map((ym) => {
          const m = parseInt(ym.slice(5, 7), 10)
          return (
            <button
              key={ym}
              type="button"
              onClick={() => onMonthToggle(ym)}
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-colors',
                selectedMonths.has(ym)
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
              )}
            >
              {m}月
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** @deprecated Use FilterBar instead. Kept for backward compatibility. */
export function DetailedFilterSheet(props: FiltersSidebarProps) {
  return <FilterBar {...props} />
}

/** @deprecated Use FilterBar instead. */
export function FiltersSidebar(props: FiltersSidebarProps) {
  return <FilterBar {...props} />
}
