import { Banknote } from 'lucide-react'
import type { Event, Category, AccessRoute, Accommodation } from '@/types/event'
import SectionCard from './SectionCard'
import DLRow from './DLRow'

const FX_TO_JPY: Record<string, number> = {
  JPY: 1, USD: 150, EUR: 165, GBP: 190, CAD: 110, AUD: 100, NZD: 90,
  PHP: 3, THB: 4, SGD: 112,
}

const JPY_PER_USD = 150

/** Extract numeric yen value from a cost string like "¥15,000" or "約15,000円～200,000円" and convert to USD display */
function costToUsd(cost: string | null | undefined): string | null {
  if (!cost) return null
  const match = cost.match(/[\d,]+/)
  if (!match) return cost
  const yen = parseInt(match[0].replace(/,/g, ''), 10)
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

/** Parse venue_access JSON from route_detail_en to get airport cost */
function getVenueAccessCost(outbound: AccessRoute | undefined): string | null {
  if (outbound?.origin_type !== 'venue_access' || !outbound.route_detail_en) return null
  try {
    const data = JSON.parse(outbound.route_detail_en)
    return data.airport_1_cost || null
  } catch { return null }
}

function CostBreakdown({ event, category, outbound, returnRoute, accommodations, isEn }: CostBreakdownProps) {
  // Convert entry fee to JPY
  const entryFeeJpy = category.entry_fee != null
    ? Math.round(category.entry_fee * (FX_TO_JPY[category.entry_fee_currency || 'JPY'] || 1))
    : null
  const entryFeeUsd = entryFeeJpy != null ? Math.round(entryFeeJpy / JPY_PER_USD) : null
  const originalCurrency = category.entry_fee_currency || 'JPY'
  const isConverted = originalCurrency !== 'JPY' && category.entry_fee != null

  // 英語版: venue_access の費用を使う
  const isVenueAccess = outbound?.origin_type === 'venue_access'
  const venueTransportCost = getVenueAccessCost(outbound)

  // 英語版トータル計算: 参加費 + 空港交通費 + 宿泊費
  const accomCost = accommodations.find((a) => a.avg_cost_3star != null)?.avg_cost_3star ?? null
  let totalEn: string | null = null
  if (isEn && isVenueAccess) {
    let total = 0
    if (entryFeeUsd != null) total += entryFeeUsd
    if (venueTransportCost) {
      const digits = venueTransportCost.replace(/[^0-9.]/g, '')
      if (digits) total += Math.round(parseFloat(digits))
    }
    if (accomCost != null) total += Math.round(accomCost / JPY_PER_USD)
    if (total > 0) totalEn = `$${total.toLocaleString()}`
  }

  return (
    <SectionCard
      title={isEn ? 'Cost' : 'コストはいくら？'}
      icon={<Banknote className="h-4 w-4 text-primary" />}
    >
      <DLRow
        label={isEn ? 'Total cost' : 'トータルコスト'}
        value={isEn
          ? (totalEn || (event.total_cost_estimate ? `$${Math.round(parseInt(event.total_cost_estimate, 10) / JPY_PER_USD).toLocaleString()}` : null))
          : (event.total_cost_estimate ? `\u00a5${parseInt(event.total_cost_estimate, 10).toLocaleString()}` : null)}
        eventId={event.id}
        categoryId={category.id}
      />
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
        {isEn && isVenueAccess ? (
          <DLRow label="Airport to venue" value={venueTransportCost} eventId={event.id} categoryId={category.id} />
        ) : (
          <>
            <DLRow label={isEn ? 'Outbound transport' : '行きの交通費'} value={isEn ? costToUsd(outbound?.cost_estimate) : outbound?.cost_estimate} eventId={event.id} categoryId={category.id} />
            <DLRow label={isEn ? 'Return transport' : '帰りの交通費'} value={isEn ? costToUsd(returnRoute?.cost_estimate) : returnRoute?.cost_estimate} eventId={event.id} categoryId={category.id} />
          </>
        )}
        <DLRow
          label={isEn ? 'Accommodation' : '宿泊費'}
          value={accomCost != null
            ? (isEn
              ? `$${Math.round(accomCost / JPY_PER_USD).toLocaleString()}`
              : `\u00a5${accomCost.toLocaleString()}`)
            : null}
          eventId={event.id}
          categoryId={category.id}
        />
      </dl>
    </SectionCard>
  )
}

export default CostBreakdown
