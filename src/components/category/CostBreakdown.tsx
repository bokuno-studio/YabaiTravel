import { Banknote } from 'lucide-react'
import type { Event, Category, AccessRoute, Accommodation } from '@/types/event'
import SectionCard from './SectionCard'
import DLRow from './DLRow'

const FX_TO_JPY: Record<string, number> = {
  JPY: 1, USD: 150, EUR: 165, GBP: 190, CAD: 110, AUD: 100, NZD: 90,
  PHP: 3, THB: 4, SGD: 112,
}

const JPY_PER_USD = 150

/** Extract numeric yen value from a cost string like "¥15,000" or "約15,000円" and convert to USD display */
function costToUsd(cost: string | null | undefined): string | null {
  if (!cost) return null
  const digits = cost.replace(/[^0-9]/g, '')
  if (!digits) return cost
  const yen = parseInt(digits, 10)
  if (isNaN(yen) || yen === 0) return cost
  return `$${Math.round(yen / JPY_PER_USD).toLocaleString()}`
}

interface CostBreakdownProps {
  event: Event
  category: Category
  outbound: AccessRoute | undefined
  returnRoute: AccessRoute | undefined
  accommodations: Accommodation[]
  isEn: boolean
}

function CostBreakdown({ event, category, outbound, returnRoute, accommodations, isEn }: CostBreakdownProps) {
  // Convert entry fee to JPY
  const entryFeeJpy = category.entry_fee != null
    ? Math.round(category.entry_fee * (FX_TO_JPY[category.entry_fee_currency || 'JPY'] || 1))
    : null
  const entryFeeUsd = entryFeeJpy != null ? Math.round(entryFeeJpy / JPY_PER_USD) : null
  const originalCurrency = category.entry_fee_currency || 'JPY'
  const isConverted = originalCurrency !== 'JPY' && category.entry_fee != null

  return (
    <SectionCard
      title={isEn ? 'Cost' : 'コストはいくら？'}
      icon={<Banknote className="h-4 w-4 text-primary" />}
    >
      {event.total_cost_estimate && (
        <DLRow
          label={isEn ? 'Total cost' : 'トータルコスト'}
          value={isEn
            ? `$${Math.round(parseInt(event.total_cost_estimate, 10) / JPY_PER_USD).toLocaleString()}`
            : `\u00a5${parseInt(event.total_cost_estimate, 10).toLocaleString()}`}
          eventId={event.id}
          categoryId={category.id}
        />
      )}
      <dl className="grid grid-cols-[minmax(120px,1fr)_minmax(180px,2fr)] gap-x-6 gap-y-3 text-sm">
        <DLRow
          label={isEn ? 'Entry fee' : '参加費'}
          value={isEn
            ? (entryFeeUsd != null
              ? `$${entryFeeUsd.toLocaleString()}${isConverted ? ` (${category.entry_fee!.toLocaleString()} ${originalCurrency})` : ''}`
              : null)
            : (entryFeeJpy != null
              ? `\u00a5${entryFeeJpy.toLocaleString()}${isConverted ? ` (${category.entry_fee!.toLocaleString()} ${originalCurrency})` : ''}`
              : null)}
          eventId={event.id}
          categoryId={category.id}
        />
        <DLRow label={isEn ? 'Outbound transport' : '行きの交通費'} value={isEn ? costToUsd(outbound?.cost_estimate) : outbound?.cost_estimate} eventId={event.id} categoryId={category.id} />
        <DLRow label={isEn ? 'Return transport' : '帰りの交通費'} value={isEn ? costToUsd(returnRoute?.cost_estimate) : returnRoute?.cost_estimate} eventId={event.id} categoryId={category.id} />
        <DLRow
          label={isEn ? 'Accommodation' : '宿泊費'}
          value={accommodations.some((a) => a.avg_cost_3star != null)
            ? (isEn
              ? `$${Math.round((accommodations.find((a) => a.avg_cost_3star != null)?.avg_cost_3star ?? 0) / JPY_PER_USD).toLocaleString()}`
              : `\u00a5${accommodations.find((a) => a.avg_cost_3star != null)?.avg_cost_3star?.toLocaleString()}`)
            : null}
          eventId={event.id}
          categoryId={category.id}
        />
      </dl>
    </SectionCard>
  )
}

export default CostBreakdown
