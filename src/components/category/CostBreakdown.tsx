import { Banknote } from 'lucide-react'
import type { Event, Category, AccessRoute, Accommodation } from '@/types/event'
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

function CostBreakdown({ event, category, outbound, returnRoute, accommodations, isEn }: CostBreakdownProps) {
  return (
    <SectionCard title={isEn ? 'Total estimated cost' : 'トータルコストはいくら？'} icon={<Banknote className="h-4 w-4 text-primary" />}>
      {event.total_cost_estimate && (
        <div className="mb-3 rounded-lg bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary">
          {isEn ? (event.total_cost_estimate_en ?? event.total_cost_estimate) : event.total_cost_estimate}
        </div>
      )}
      <dl className="grid grid-cols-[minmax(120px,1fr)_minmax(180px,2fr)] gap-x-6 gap-y-3 text-sm">
        <DLRow
          label={isEn ? 'Entry fee?' : '参加費はいくら？'}
          value={category.entry_fee != null ? `${category.entry_fee.toLocaleString()} ${category.entry_fee_currency ?? (isEn ? 'JPY' : '円')}` : null}
        />
        <DLRow label={isEn ? 'Outbound transport?' : '行きの交通費は？'} value={outbound?.cost_estimate} />
        <DLRow label={isEn ? 'Return transport?' : '帰りの交通費は？'} value={returnRoute?.cost_estimate} />
        <DLRow
          label={isEn ? 'Accommodation?' : '宿泊費は？'}
          value={accommodations.some((a) => a.avg_cost_3star != null)
            ? (isEn
              ? `Approx. ${accommodations.find((a) => a.avg_cost_3star != null)?.avg_cost_3star?.toLocaleString()} JPY`
              : `\u7D04${accommodations.find((a) => a.avg_cost_3star != null)?.avg_cost_3star?.toLocaleString()}\u5186`)
            : null}
        />
      </dl>
    </SectionCard>
  )
}

export default CostBreakdown
