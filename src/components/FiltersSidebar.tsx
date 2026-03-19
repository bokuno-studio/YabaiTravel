import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import PriceHistogramSlider from '@/components/PriceHistogramSlider'

interface FiltersSidebarProps {
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

export function FiltersSidebar({
  availableRaceTypes,
  raceTypes,
  onRaceTypeToggle,
  raceTypeLabel,
  availableCategories,
  selectedCategories,
  onCategoryToggle,
  availableMonths,
  selectedMonths,
  onMonthToggle,
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
}: FiltersSidebarProps) {
  return (
    <div className="space-y-5">
      {/* Race Type */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('filter.raceType')}
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {availableRaceTypes.map((type) => (
            <Badge
              key={type}
              variant={raceTypes.has(type) ? 'default' : 'outline'}
              className={cn(
                'cursor-pointer select-none transition-all text-xs',
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
      </div>

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

      {/* Month */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('filter.month')}
        </h3>
        <div className="flex flex-wrap gap-1">
          {availableMonths.map((ym) => {
            const m = parseInt(ym.slice(5, 7), 10)
            return (
              <button
                key={ym}
                type="button"
                onClick={() => onMonthToggle(ym)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
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
  )
}
