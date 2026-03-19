import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SlidersHorizontal } from 'lucide-react'
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
  /* Past events */
  showPastEvents: boolean
  onShowPastEventsChange: (value: boolean) => void
  /* i18n */
  t: (key: string, options?: Record<string, unknown>) => string
  lang: string | undefined
}

/** Primary filter chips: race type + month (horizontal scrolling bar at top of content) */
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
      {/* Race type chips */}
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

      {/* Separator */}
      {availableMonths.length > 0 && availableRaceTypes.length > 0 && (
        <div className="shrink-0 w-px bg-border" />
      )}

      {/* Month chips */}
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

/** Detailed filters: shown inside a Sheet, opened by the "絞り込み" button */
export function DetailedFilterSheet(props: FiltersSidebarProps) {
  const {
    availableCategories,
    selectedCategories,
    onCategoryToggle,
    distanceRanges,
    onDistanceRangeToggle,
    distanceRangeOptions,
    timeLimitMin,
    onTimeLimitChange,
    costPrices,
    costMin,
    costMax,
    costGlobalMax,
    onCostRangeChange,
    entryStatus,
    onEntryStatusChange,
    showPastEvents,
    onShowPastEventsChange,
    t,
    lang,
  } = props

  const hasDetailedFilter = selectedCategories.size > 0 || distanceRanges.size > 0 || !!timeLimitMin || costMin > 0 || costMax < Infinity || entryStatus !== 'active' || showPastEvents

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0">
          <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
          {lang === 'en' ? 'Filters' : '絞り込み'}
          {hasDetailedFilter && (
            <span className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
              !
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{lang === 'en' ? 'Detailed Filters' : '詳細フィルター'}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-5 px-4">
          {/* Category */}
          {availableCategories.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('filter.category')}
              </h3>
              <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                {availableCategories.slice(0, 20).map((name) => (
                  <Badge
                    key={name}
                    variant={selectedCategories.has(name) ? 'default' : 'outline'}
                    className={cn(
                      'cursor-pointer select-none transition-all text-xs',
                      selectedCategories.has(name)
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                        : 'hover:bg-secondary',
                    )}
                    onClick={() => onCategoryToggle(name)}
                  >
                    {name}
                  </Badge>
                ))}
                {availableCategories.length > 20 && (
                  <span className="self-center text-xs text-muted-foreground">
                    {lang === 'en' ? `+${availableCategories.length - 20} more` : `他${availableCategories.length - 20}件`}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Distance */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('filter.distance')}
            </h3>
            <div className="flex flex-wrap gap-1">
              {distanceRangeOptions.map((range, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onDistanceRangeToggle(idx)}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                    distanceRanges.has(idx)
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
              {t('filter.timeLimit')}
            </h3>
            <select
              value={timeLimitMin}
              onChange={(e) => onTimeLimitChange(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
            >
              <option value="">{t('filter.noLimit')}</option>
              <option value="6">{t('filter.hoursOrMore', { hours: 6 })}</option>
              <option value="12">{t('filter.hoursOrMore', { hours: 12 })}</option>
              <option value="24">{t('filter.hoursOrMore', { hours: 24 })}</option>
              <option value="36">{t('filter.hoursOrMore', { hours: 36 })}</option>
            </select>
          </div>

          {/* Cost */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {lang === 'en' ? 'Est. Cost' : 'コスト目安'}
            </h3>
            <PriceHistogramSlider
              prices={costPrices}
              min={costMin}
              max={costMax >= Infinity ? costGlobalMax : costMax}
              onRangeChange={(newMin, newMax) => {
                onCostRangeChange(newMin, newMax >= costGlobalMax ? Infinity : newMax)
              }}
              currency={lang === 'en' ? '$' : '¥'}
            />
          </div>

          {/* Entry Status */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('filter.entryStatus')}
            </h3>
            <select
              value={entryStatus}
              onChange={(e) => onEntryStatusChange(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
            >
              <option value="active">{t('filter.entryActive')}</option>
              <option value="open">{t('filter.entryOpen')}</option>
              <option value="upcoming">{t('filter.entryUpcoming')}</option>
              <option value="closed">{t('filter.entryClosed')}</option>
              <option value="">{t('filter.entryAll')}</option>
            </select>
          </div>

          {/* Show Past Events */}
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={showPastEvents}
              onChange={(e) => onShowPastEventsChange(e.target.checked)}
              className="h-4 w-4 rounded border-input text-primary accent-primary"
            />
            <span className="text-sm font-medium text-foreground">
              {t('filter.showPast')}
            </span>
          </label>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/** Legacy combined sidebar export (kept for backward compat, but no longer used in EventList) */
export function FiltersSidebar(props: FiltersSidebarProps) {
  return (
    <div className="space-y-5">
      <FilterChipBar
        availableRaceTypes={props.availableRaceTypes}
        raceTypes={props.raceTypes}
        onRaceTypeToggle={props.onRaceTypeToggle}
        raceTypeLabel={props.raceTypeLabel}
        availableMonths={props.availableMonths}
        selectedMonths={props.selectedMonths}
        onMonthToggle={props.onMonthToggle}
      />
      <DetailedFilterSheet {...props} />
    </div>
  )
}
