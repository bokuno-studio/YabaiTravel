import {
  Mountain,
  TrendingUp,
  Clock,
  Banknote,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Category } from '@/types/event'
import SectionCard from './SectionCard'
import StatBox from './StatBox'
import DLRow from './DLRow'
import ChangeRequestButton from '@/components/ChangeRequestButton'

interface RaceSpecsProps {
  eventId: string
  category: Category
  isEn: boolean
  formatInterval: (v: string | null) => string | null
  formatCutoffTimes: (cutoff: unknown) => string | null
  displayReceptionPlace: string | null | undefined
  displayStartPlace: string | null | undefined
  displayMandatoryGear: string | null | undefined
  displayRecommendedGear: string | null | undefined
  displayProhibitedItems: string | null | undefined
  displayRequiredPace: string | null | undefined
  displayRequiredClimbPace: string | null | undefined
}

function RaceSpecs({
  eventId,
  category,
  isEn,
  formatInterval,
  formatCutoffTimes,
  displayReceptionPlace,
  displayStartPlace,
  displayMandatoryGear,
  displayRecommendedGear,
  displayProhibitedItems,
  displayRequiredPace,
  displayRequiredClimbPace,
}: RaceSpecsProps) {
  const computedPace = (() => {
    if (displayRequiredPace) return displayRequiredPace
    if (category.distance_km && category.time_limit) {
      const parts = category.time_limit.match(/(\d+):(\d+):(\d+)/)
      if (parts) {
        const totalMin = parseInt(parts[1]) * 60 + parseInt(parts[2]) + parseInt(parts[3]) / 60
        const paceMin = totalMin / category.distance_km
        const m = Math.floor(paceMin)
        const s = Math.round((paceMin - m) * 60)
        return `${m}:${String(s).padStart(2, '0')} /km${isEn ? ' (calculated from time limit)' : '（制限時間から算出）'}`
      }
    }
    return null
  })()

  return (
    <SectionCard
      title={isEn ? 'Race specs' : 'このレースのスペックは？'}
      icon={<Mountain className="h-4 w-4 text-primary" />}
      action={
        <ChangeRequestButton
          eventId={eventId}
          categoryId={category.id}
          fieldName={isEn ? 'Race specs' : 'レーススペック'}
          currentValue={[
            category.distance_km != null ? `${category.distance_km}km` : null,
            category.elevation_gain != null ? `D+${category.elevation_gain}m` : null,
            category.entry_fee != null ? `${category.entry_fee.toLocaleString()}${category.entry_fee_currency ?? '円'}` : null,
          ].filter(Boolean).join(' / ') || undefined}
        />
      }
    >
      {/* Quick stats grid */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {category.distance_km != null && (
          <StatBox icon={<TrendingUp className="h-4 w-4" />} label={isEn ? 'Distance' : '距離'} value={`${category.distance_km}km`} />
        )}
        {category.elevation_gain != null && (
          <StatBox icon={<Mountain className="h-4 w-4" />} label={isEn ? 'Elevation' : '獲得標高'} value={`${category.elevation_gain}m`} />
        )}
        {category.time_limit && (
          <StatBox icon={<Clock className="h-4 w-4" />} label={isEn ? 'Time limit' : '制限時間'} value={formatInterval(category.time_limit) ?? '\u2014'} />
        )}
        {category.entry_fee != null && (
          <StatBox icon={<Banknote className="h-4 w-4" />} label={isEn ? 'Entry fee' : '参加費'} value={`${category.entry_fee.toLocaleString()} ${category.entry_fee_currency ?? (isEn ? 'JPY' : '円')}`} />
        )}
      </div>

      <dl className="grid grid-cols-[minmax(120px,1fr)_minmax(180px,2fr)] gap-x-6 gap-y-3 text-sm">
        <DLRow label={isEn ? 'Start time?' : 'スタートは何時？'} value={category.start_time ? (isEn ? `${category.start_time} start` : `${category.start_time} スタート`) : null} />
        <DLRow label={isEn ? 'Check-in deadline?' : '受付は何時まで？'} value={category.reception_end} />
        <DLRow label={isEn ? 'Check-in location?' : '受付場所は？'} value={displayReceptionPlace} />
        <DLRow label={isEn ? 'Start location?' : 'スタート場所は？'} value={displayStartPlace} />
        <DLRow label={isEn ? 'Finish rate?' : '完走率は？'} value={category.finish_rate != null ? `${(category.finish_rate * 100).toFixed(1)}%` : null} />
        <dt className="text-muted-foreground">{isEn ? 'Cutoff times?' : 'カットオフは？'}</dt>
        <dd className={cn(
          formatCutoffTimes(category.cutoff_times) ? 'whitespace-pre-wrap' : 'italic text-muted-foreground/60',
        )}>
          {formatCutoffTimes(category.cutoff_times) ?? '\u2014'}
        </dd>
        <DLRow label={isEn ? 'Required pace?' : '必要なペースは？'} value={computedPace} />
        <DLRow label={isEn ? 'Required climb pace?' : '登りに必要なペースは？'} value={displayRequiredClimbPace} />
        <DLRow label={isEn ? 'Mandatory gear?' : '必携品は？'} value={displayMandatoryGear} multiline />
        <DLRow label={isEn ? 'Recommended gear?' : '持っておくと良いものは？'} value={displayRecommendedGear} multiline />
        <DLRow label={isEn ? 'Prohibited items?' : '使用禁止品は？'} value={displayProhibitedItems} />
        <DLRow label={isEn ? 'Poles allowed?' : 'ポールは使える？'} value={category.poles_allowed != null ? (category.poles_allowed ? (isEn ? 'Allowed' : '可') : (isEn ? 'Not allowed' : '不可')) : null} />
        <DLRow
          label={isEn ? 'Entry fee?' : '参加費はいくら？'}
          value={category.entry_fee != null ? `${category.entry_fee.toLocaleString()} ${category.entry_fee_currency ?? (isEn ? 'JPY' : '円')}` : null}
        />
      </dl>
    </SectionCard>
  )
}

export default RaceSpecs
