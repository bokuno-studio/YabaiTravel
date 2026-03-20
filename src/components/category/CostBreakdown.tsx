import { Banknote } from 'lucide-react'
import type { Event, Category, AccessRoute, Accommodation } from '@/types/event'
import SectionCard from './SectionCard'
import DLRow from './DLRow'
import ChangeRequestButton from '@/components/ChangeRequestButton'

const FX_TO_JPY: Record<string, number> = {
  JPY: 1, USD: 150, EUR: 165, GBP: 190, CAD: 110, AUD: 100, NZD: 90,
  PHP: 3, THB: 4, SGD: 112,
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
  const originalCurrency = category.entry_fee_currency || 'JPY'
  const isConverted = originalCurrency !== 'JPY' && category.entry_fee != null

  return (
    <SectionCard
      title={isEn ? 'Cost' : 'コストはいくら？'}
      icon={<Banknote className="h-4 w-4 text-primary" />}
      action={
        <ChangeRequestButton
          eventId={event.id}
          categoryId={category.id}
          fieldName={isEn ? 'Cost breakdown' : 'コスト'}
          currentValue={event.total_cost_estimate ? `${parseInt(event.total_cost_estimate, 10).toLocaleString()}円` : undefined}
        />
      }
    >
      {event.total_cost_estimate && (
        <DLRow
          label={isEn ? 'Total cost' : 'トータルコスト'}
          value={`¥${parseInt(event.total_cost_estimate, 10).toLocaleString()}`}
        />
      )}
      <dl className="grid grid-cols-[minmax(120px,1fr)_minmax(180px,2fr)] gap-x-6 gap-y-3 text-sm">
        <DLRow
          label={isEn ? 'Entry fee' : '参加費'}
          value={entryFeeJpy != null
            ? `¥${entryFeeJpy.toLocaleString()}${isConverted ? ` (${category.entry_fee!.toLocaleString()} ${originalCurrency})` : ''}`
            : null}
        />
        <DLRow label={isEn ? 'Outbound transport' : '行きの交通費'} value={outbound?.cost_estimate} />
        <DLRow label={isEn ? 'Return transport' : '帰りの交通費'} value={returnRoute?.cost_estimate} />
        <DLRow
          label={isEn ? 'Accommodation' : '宿泊費'}
          value={accommodations.some((a) => a.avg_cost_3star != null)
            ? `¥${accommodations.find((a) => a.avg_cost_3star != null)?.avg_cost_3star?.toLocaleString()}`
            : null}
        />
      </dl>
    </SectionCard>
  )
}

export default CostBreakdown
