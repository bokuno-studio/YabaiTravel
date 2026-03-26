import { Banknote } from 'lucide-react'
import type { Event, Category, AccessRoute, Accommodation } from '@/types/event'
import { FX_TO_JPY, convertJpyToUsd, formatCurrency, costStringToUsd } from '@/lib/currency'
import SectionCard from './SectionCard'
import DLRow from './DLRow'

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
  const entryFeeUsd = entryFeeJpy != null ? convertJpyToUsd(entryFeeJpy) : null
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
    if (accomCost != null) total += convertJpyToUsd(accomCost)
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
          ? (totalEn || (event.total_cost_estimate ? formatCurrency(parseInt(event.total_cost_estimate, 10), true) : null))
          : (event.total_cost_estimate ? formatCurrency(parseInt(event.total_cost_estimate, 10), false) : null)}
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
            <DLRow label={isEn ? 'Outbound transport' : '行きの交通費'} value={isEn ? costStringToUsd(outbound?.cost_estimate) : outbound?.cost_estimate} eventId={event.id} categoryId={category.id} />
            <DLRow label={isEn ? 'Return transport' : '帰りの交通費'} value={isEn ? costStringToUsd(returnRoute?.cost_estimate) : returnRoute?.cost_estimate} eventId={event.id} categoryId={category.id} />
          </>
        )}
        <DLRow
          label={isEn ? 'Accommodation' : '宿泊費'}
          value={accomCost != null
            ? formatCurrency(accomCost, isEn)
            : null}
          eventId={event.id}
          categoryId={category.id}
        />
      </dl>
    </SectionCard>
  )
}

export default CostBreakdown
