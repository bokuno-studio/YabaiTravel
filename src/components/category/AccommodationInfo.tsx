import { Home } from 'lucide-react'
import type { Accommodation } from '@/types/event'
import SectionCard from './SectionCard'
import DLRow from './DLRow'

const JPY_PER_USD = 150

interface AccommodationInfoProps {
  eventId: string
  categoryId?: string
  accommodations: Accommodation[]
  isEn: boolean
}

function AccommodationInfo({ eventId, categoryId, accommodations, isEn }: AccommodationInfoProps) {
  return (
    <SectionCard
      title={isEn ? 'How many days needed?' : '何日必要か'}
      icon={<Home className="h-4 w-4 text-primary" />}
    >
      <dl className="grid grid-cols-[minmax(120px,1fr)_minmax(180px,2fr)] gap-x-6 gap-y-3 text-sm">
        <DLRow
          label={isEn ? 'Where to stay?' : 'どこに泊まればいい？'}
          value={accommodations.some((a) => a.recommended_area)
            ? accommodations.map((a) => isEn ? (a.recommended_area_en ?? a.recommended_area) : a.recommended_area).filter(Boolean).join('\u3001')
            : null}
          eventId={eventId} categoryId={categoryId}
        />
        <DLRow
          label={isEn ? 'Accommodation cost?' : '宿泊費の目安は？'}
          value={accommodations.some((a) => a.avg_cost_3star != null)
            ? (isEn
              ? `Approx. $${Math.round((accommodations.find((a) => a.avg_cost_3star != null)?.avg_cost_3star ?? 0) / JPY_PER_USD).toLocaleString()}`
              : `\u7D04${accommodations.find((a) => a.avg_cost_3star != null)?.avg_cost_3star?.toLocaleString()}\u5186`)
            : null}
          eventId={eventId} categoryId={categoryId}
        />
      </dl>
    </SectionCard>
  )
}

export default AccommodationInfo
