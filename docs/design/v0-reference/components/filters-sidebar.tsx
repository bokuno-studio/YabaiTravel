'use client'

import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { raceTypeLabels } from '@/lib/data'
import type { RaceType, EntryStatus } from '@/lib/types'

interface FiltersSidebarProps {
  locale: 'en' | 'ja'
  selectedRaceTypes: RaceType[]
  onRaceTypeToggle: (type: RaceType) => void
  selectedMonth: number | null
  onMonthChange: (month: number | null) => void
  distanceRange: [number, number]
  onDistanceRangeChange: (range: [number, number]) => void
  costRange: [number, number]
  onCostRangeChange: (range: [number, number]) => void
  showAcceptingOnly: boolean
  onShowAcceptingOnlyChange: (value: boolean) => void
}

const raceTypes: RaceType[] = ['trail', 'hyrox', 'spartan', 'marathon', 'ultra', 'triathlon']

const months = [
  { value: 1, en: 'Jan', ja: '1月' },
  { value: 2, en: 'Feb', ja: '2月' },
  { value: 3, en: 'Mar', ja: '3月' },
  { value: 4, en: 'Apr', ja: '4月' },
  { value: 5, en: 'May', ja: '5月' },
  { value: 6, en: 'Jun', ja: '6月' },
  { value: 7, en: 'Jul', ja: '7月' },
  { value: 8, en: 'Aug', ja: '8月' },
  { value: 9, en: 'Sep', ja: '9月' },
  { value: 10, en: 'Oct', ja: '10月' },
  { value: 11, en: 'Nov', ja: '11月' },
  { value: 12, en: 'Dec', ja: '12月' }
]

export function FiltersSidebar({
  locale,
  selectedRaceTypes,
  onRaceTypeToggle,
  selectedMonth,
  onMonthChange,
  distanceRange,
  onDistanceRangeChange,
  costRange,
  onCostRangeChange,
  showAcceptingOnly,
  onShowAcceptingOnlyChange
}: FiltersSidebarProps) {
  const formatCost = (value: number) => {
    return `¥${(value / 1000).toFixed(0)}K`
  }

  return (
    <aside className="w-full space-y-6 lg:w-72">
      {/* Race Type Filter */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {locale === 'ja' ? 'レースタイプ' : 'Race Type'}
        </h3>
        <div className="flex flex-wrap gap-2">
          {raceTypes.map((type) => (
            <Badge
              key={type}
              variant={selectedRaceTypes.includes(type) ? 'default' : 'outline'}
              className={cn(
                'cursor-pointer select-none transition-all',
                selectedRaceTypes.includes(type)
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'hover:bg-secondary'
              )}
              onClick={() => onRaceTypeToggle(type)}
            >
              {raceTypeLabels[type]?.[locale] ?? type}
            </Badge>
          ))}
        </div>
      </div>

      {/* Month Filter */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {locale === 'ja' ? '開催月' : 'Month'}
        </h3>
        <div className="grid grid-cols-4 gap-1">
          {months.map((month) => (
            <button
              key={month.value}
              onClick={() => onMonthChange(selectedMonth === month.value ? null : month.value)}
              className={cn(
                'rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                selectedMonth === month.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              )}
            >
              {month[locale]}
            </button>
          ))}
        </div>
      </div>

      {/* Distance Range Filter */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {locale === 'ja' ? '距離' : 'Distance'}
        </h3>
        <div className="px-1">
          <Slider
            value={distanceRange}
            onValueChange={(value) => onDistanceRangeChange(value as [number, number])}
            min={0}
            max={200}
            step={5}
          />
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>{distanceRange[0]}km</span>
            <span>{distanceRange[1]}km+</span>
          </div>
        </div>
      </div>

      {/* Cost Range Filter */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {locale === 'ja' ? '推定費用' : 'Estimated Cost'}
        </h3>
        <div className="px-1">
          <Slider
            value={costRange}
            onValueChange={(value) => onCostRangeChange(value as [number, number])}
            min={0}
            max={150000}
            step={5000}
          />
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>{formatCost(costRange[0])}</span>
            <span>{formatCost(costRange[1])}</span>
          </div>
        </div>
        {/* Cost Distribution Visualization */}
        <div className="flex h-8 items-end gap-0.5">
          {[15, 25, 40, 60, 80, 70, 50, 35, 20, 10].map((height, i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-primary/30"
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
      </div>

      {/* Entry Status Toggle */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {locale === 'ja' ? 'エントリー受付中のみ' : 'Accepting Entries Only'}
        </span>
        <Switch
          checked={showAcceptingOnly}
          onCheckedChange={onShowAcceptingOnlyChange}
        />
      </div>
    </aside>
  )
}
