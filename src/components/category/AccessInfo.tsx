import { Train } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AccessRoute } from '@/types/event'
import SectionCard from './SectionCard'
import DLRow from './DLRow'

interface AccessInfoProps {
  outbound: AccessRoute | undefined
  returnRoute: AccessRoute | undefined
  sameStartGoal: boolean
  isEn: boolean
  displayOutboundRoute: string | null | undefined
  displayReturnRoute: string | null | undefined
  displayOutboundShuttle: string | null | undefined
}

function AccessInfo({
  outbound,
  returnRoute,
  sameStartGoal,
  isEn,
  displayOutboundRoute,
  displayReturnRoute,
  displayOutboundShuttle,
}: AccessInfoProps) {
  return (
    <>
      {/* 公共交通機関で行けるか */}
      <SectionCard title={isEn ? 'Public transit access' : '公共交通機関で行けるか'} icon={<Train className="h-4 w-4 text-primary" />}>
        {outbound?.transit_accessible != null && (
          <p className={cn(
            'mb-3 rounded-lg px-3 py-2 text-sm font-medium',
            outbound.transit_accessible
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-red-50 text-red-700',
          )}>
            {outbound.transit_accessible
              ? (isEn ? 'Accessible by public transit' : '公共交通機関で行ける')
              : (isEn ? 'Not easily accessible by public transit (car/shuttle needed)' : '公共交通機関では行きにくい（要車・要シャトル）')}
          </p>
        )}
        <div className="flex flex-wrap gap-4">
          <div className="flex items-baseline gap-2 text-sm">
            <span className="min-w-[2.5em] font-semibold text-muted-foreground">{isEn ? 'To' : '往路'}</span>
            <span className={outbound?.total_time_estimate ? '' : 'italic text-muted-foreground/60'}>{outbound?.total_time_estimate ?? '\u2014'}</span>
            {outbound?.cost_estimate && <span className="font-medium text-primary">{outbound.cost_estimate}</span>}
          </div>
          <div className="flex items-baseline gap-2 text-sm">
            <span className="min-w-[2.5em] font-semibold text-muted-foreground">{isEn ? 'From' : '復路'}</span>
            <span className={returnRoute?.total_time_estimate ? '' : 'italic text-muted-foreground/60'}>{returnRoute?.total_time_estimate ?? '\u2014'}</span>
            {returnRoute?.cost_estimate && <span className="font-medium text-primary">{returnRoute.cost_estimate}</span>}
          </div>
        </div>
      </SectionCard>

      {/* どうやって行く？ */}
      <SectionCard title={isEn ? 'How to get there?' : 'どうやって行く？'} icon={<Train className="h-4 w-4 text-primary" />}>
        <h3 className="mb-2 text-sm font-semibold text-foreground">{isEn ? 'Outbound' : '往路'}</h3>
        <dl className="grid grid-cols-[minmax(120px,1fr)_minmax(180px,2fr)] gap-x-6 gap-y-3 text-sm">
          <DLRow label={isEn ? 'Route?' : 'どのルートで行く？'} value={displayOutboundRoute} multiline />
          <DLRow label={isEn ? 'Travel time?' : '所要時間は？'} value={outbound?.total_time_estimate} />
          <DLRow label={isEn ? 'Cost estimate?' : '費用の目安は？'} value={outbound?.cost_estimate} />
          <DLRow label={isEn ? 'Cash needed?' : '現金は必要？'} value={outbound?.cash_required != null ? (outbound.cash_required ? (isEn ? 'Yes' : 'あり') : (isEn ? 'No' : 'なし')) : null} />
          <dt className="text-muted-foreground">{isEn ? 'Booking site?' : '予約サイトは？'}</dt>
          <dd className={outbound?.booking_url ? '' : 'italic text-muted-foreground/60'}>
            {outbound?.booking_url
              ? <a href={outbound.booking_url} target="_blank" rel="noreferrer" className="break-all text-primary hover:underline">{outbound.booking_url}</a>
              : '\u2014'}
          </dd>
          <DLRow label={isEn ? 'Shuttle bus?' : 'シャトルバスはある？'} value={displayOutboundShuttle} />
          <DLRow label={isEn ? 'Taxi?' : 'タクシーは？'} value={outbound?.taxi_estimate} />
        </dl>
        {sameStartGoal ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {isEn ? 'Start and finish are at the same location. Return route is the same as outbound.' : 'スタート・ゴール同一のため、復路は往路と同様です。'}
          </p>
        ) : (
          <>
            <h3 className="mb-2 mt-4 text-sm font-semibold text-foreground">{isEn ? 'Return' : '復路'}</h3>
            <dl className="grid grid-cols-[minmax(120px,1fr)_minmax(180px,2fr)] gap-x-6 gap-y-3 text-sm">
              <DLRow label={isEn ? 'Route?' : 'どのルートで行く？'} value={displayReturnRoute} multiline />
              <DLRow label={isEn ? 'Travel time?' : '所要時間は？'} value={returnRoute?.total_time_estimate} />
              <DLRow label={isEn ? 'Cost estimate?' : '費用の目安は？'} value={returnRoute?.cost_estimate} />
            </dl>
          </>
        )}
      </SectionCard>
    </>
  )
}

export default AccessInfo
