import { useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import PriceHistogramSlider from '@/components/PriceHistogramSlider'
import type { FiltersSidebarProps } from '@/components/FiltersSidebar'

/** Format year-month for display: "2026年3月" or "2026/03" */
function formatYearMonth(ym: string, lang: string | undefined): string {
  const [year, month] = ym.split('-')
  const m = parseInt(month, 10)
  if (lang === 'en') return `${year}/${month}`
  return `${year}年${m}月`
}

/** Group months by year */
function groupMonthsByYear(months: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>()
  for (const ym of months) {
    const year = ym.slice(0, 4)
    if (!groups.has(year)) groups.set(year, [])
    groups.get(year)!.push(ym)
  }
  return groups
}

/** Collapsible section wrapper */
function FilterSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-border/50 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors bg-transparent border-0 cursor-pointer"
      >
        <span>{title}</span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}

/** Sub-section (e.g. year within month filter) */
function SubSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-1 py-1 text-sm text-foreground/80 hover:text-foreground transition-colors bg-transparent border-0 cursor-pointer"
      >
        <ChevronDown
          className={cn('h-3 w-3 transition-transform', open ? 'rotate-0' : '-rotate-90')}
        />
        <span>{title}</span>
      </button>
      {open && <div className="ml-4 mt-1">{children}</div>}
    </div>
  )
}

/** Count active filters */
function countActiveFilters(props: FiltersSidebarProps): number {
  let count = 0
  if (props.raceTypes.size > 0) count++
  if (props.selectedMonths.size > 0) count++
  if (props.selectedCategories.size > 0) count++
  if (props.distanceRanges.size > 0) count++
  if (props.timeLimitMin) count++
  if (props.costMin > 0 || props.costMax < Infinity) count++
  if (props.entryStatus !== 'active') count++
  if (props.showPastEvents) count++
  return count
}

/** Sidebar filter controls to embed in SideMenu */
export default function SidebarFilters(props: FiltersSidebarProps) {
  const isEn = props.lang === 'en'
  const activeCount = countActiveFilters(props)

  const clearAll = () => {
    // Clear all filters by toggling off each active one
    for (const type of props.raceTypes) props.onRaceTypeToggle(type)
    for (const m of props.selectedMonths) props.onMonthToggle(m)
    for (const c of props.selectedCategories) props.onCategoryToggle(c)
    for (const idx of props.distanceRanges) props.onDistanceRangeToggle(idx)
    if (props.timeLimitMin) props.onTimeLimitChange('')
    if (props.costMin > 0 || props.costMax < Infinity) props.onCostRangeChange(0, Infinity)
    if (props.entryStatus !== 'active') props.onEntryStatusChange('active')
    if (props.showPastEvents) props.onShowPastEventsChange(false)
  }

  const yearGroups = groupMonthsByYear(props.availableMonths)

  return (
    <div className="space-y-0">
      {/* Section header */}
      <div className="flex items-center justify-between px-3 pb-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">
          {isEn ? 'Filters' : '絞り込み'}
        </p>
        {activeCount > 0 && (
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
            {activeCount}
          </span>
        )}
      </div>

      {/* Race Type */}
      {props.availableRaceTypes.length > 0 && (
        <FilterSection title={isEn ? 'Race Type' : 'レース種別'} defaultOpen>
          <div className="space-y-0.5">
            {props.availableRaceTypes.map((type) => (
              <label
                key={type}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-secondary/50 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={props.raceTypes.has(type)}
                  onChange={() => props.onRaceTypeToggle(type)}
                  className="h-3.5 w-3.5 rounded border-input text-primary accent-primary"
                />
                <span className="text-xs">{props.raceTypeLabel(type)}</span>
              </label>
            ))}
          </div>
        </FilterSection>
      )}

      {/* Month - grouped by year */}
      {props.availableMonths.length > 0 && (
        <FilterSection title={isEn ? 'Month' : '開催時期'} defaultOpen>
          <div className="space-y-1">
            {[...yearGroups.entries()].map(([year, months], yearIdx) => (
              <SubSection
                key={year}
                title={isEn ? year : `${year}年`}
                defaultOpen={yearIdx === 0}
              >
                <div className="grid grid-cols-2 gap-x-1 gap-y-0.5">
                  {months.map((ym) => {
                    const m = parseInt(ym.slice(5, 7), 10)
                    return (
                      <label
                        key={ym}
                        className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 hover:bg-secondary/50 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={props.selectedMonths.has(ym)}
                          onChange={() => props.onMonthToggle(ym)}
                          className="h-3.5 w-3.5 rounded border-input text-primary accent-primary"
                        />
                        <span className="text-xs">
                          {isEn ? formatYearMonth(ym, props.lang) : `${m}月`}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </SubSection>
            ))}
          </div>
        </FilterSection>
      )}

      {/* Category */}
      {props.availableCategories.length > 0 && (
        <FilterSection title={props.t('filter.category')}>
          <div className="flex flex-wrap gap-1">
            {props.availableCategories.slice(0, 20).map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => props.onCategoryToggle(name)}
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors',
                  props.selectedCategories.has(name)
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
                )}
              >
                {name}
              </button>
            ))}
            {props.availableCategories.length > 20 && (
              <span className="self-center text-[11px] text-muted-foreground">
                {isEn
                  ? `+${props.availableCategories.length - 20} more`
                  : `他${props.availableCategories.length - 20}件`}
              </span>
            )}
          </div>
        </FilterSection>
      )}

      {/* Distance */}
      <FilterSection title={props.t('filter.distance')}>
        <div className="flex flex-wrap gap-1">
          {props.distanceRangeOptions.map((range, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => props.onDistanceRangeToggle(idx)}
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors',
                props.distanceRanges.has(idx)
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
              )}
            >
              {range.label}
            </button>
          ))}
        </div>
      </FilterSection>

      {/* Time Limit */}
      <FilterSection title={props.t('filter.timeLimit')}>
        <select
          value={props.timeLimitMin}
          onChange={(e) => props.onTimeLimitChange(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
        >
          <option value="">{props.t('filter.noLimit')}</option>
          <option value="6">{props.t('filter.hoursOrMore', { hours: 6 })}</option>
          <option value="12">{props.t('filter.hoursOrMore', { hours: 12 })}</option>
          <option value="24">{props.t('filter.hoursOrMore', { hours: 24 })}</option>
          <option value="36">{props.t('filter.hoursOrMore', { hours: 36 })}</option>
        </select>
      </FilterSection>

      {/* Cost */}
      <FilterSection title={isEn ? 'Est. Cost' : 'コスト目安'}>
        <PriceHistogramSlider
          prices={props.costPrices}
          min={props.costMin}
          max={props.costMax >= Infinity ? props.costGlobalMax : props.costMax}
          onRangeChange={(newMin, newMax) => {
            props.onCostRangeChange(newMin, newMax >= props.costGlobalMax ? Infinity : newMax)
          }}
          currency={isEn ? '$' : '¥'}
          lang={props.lang}
        />
      </FilterSection>

      {/* Entry Status */}
      <FilterSection title={props.t('filter.entryStatus')}>
        <select
          value={props.entryStatus}
          onChange={(e) => props.onEntryStatusChange(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
        >
          <option value="active">{props.t('filter.entryActive')}</option>
          <option value="open">{props.t('filter.entryOpen')}</option>
          <option value="upcoming">{props.t('filter.entryUpcoming')}</option>
          <option value="closed">{props.t('filter.entryClosed')}</option>
          <option value="">{props.t('filter.entryAll')}</option>
        </select>
      </FilterSection>

      {/* Past Events */}
      <div className="px-3 py-2">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={props.showPastEvents}
            onChange={(e) => props.onShowPastEventsChange(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-input text-primary accent-primary"
          />
          <span className="text-xs font-medium text-foreground">
            {props.t('filter.showPast')}
          </span>
        </label>
      </div>

      {/* Clear All */}
      {activeCount > 0 && (
        <div className="px-3 pb-2">
          <button
            type="button"
            onClick={clearAll}
            className="flex w-full items-center justify-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors bg-transparent cursor-pointer"
          >
            <X className="h-3 w-3" />
            {isEn ? 'Clear filters' : '条件をクリア'}
          </button>
        </div>
      )}
    </div>
  )
}
