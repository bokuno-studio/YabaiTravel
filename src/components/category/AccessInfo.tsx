import { Train } from 'lucide-react'
import type { AccessRoute } from '@/types/event'
import { costStringToUsd } from '@/lib/currency'
import SectionCard from './SectionCard'
import DLRow from './DLRow'

interface AccessInfoProps {
  eventId: string
  categoryId?: string
  outbound: AccessRoute | undefined
  returnRoute: AccessRoute | undefined
  sameStartGoal: boolean
  isEn: boolean
  displayOutboundRoute: string | null | undefined
  displayReturnRoute: string | null | undefined
  displayOutboundShuttle: string | null | undefined
  visaInfo?: string | null
}

/** Check if displaying venue_access (English mode with venue access data) */
function isVenueAccess(route: AccessRoute | undefined): boolean {
  return route?.origin_type === 'venue_access'
}

/** Structured venue access JSON from enrich-logi-en */
interface VenueAccessData {
  airport_1_name?: string
  airport_1_access?: string | null
  airport_1_cost?: string | null
  airport_2_name?: string
  airport_2_access?: string | null
  airport_2_cost?: string | null
  station_name?: string
  station_access?: string | null
  station_cost?: string | null
}

/** Try to parse route_detail_en as structured JSON; return null on failure */
function parseVenueAccessJson(raw: string | null | undefined): VenueAccessData | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    // Validate it's an object with at least one expected key
    if (typeof parsed === 'object' && parsed !== null && (parsed.airport_1_name || parsed.station_name)) {
      return parsed as VenueAccessData
    }
    return null
  } catch {
    return null
  }
}

function AccessInfo({
  eventId,
  categoryId,
  outbound,
  returnRoute,
  sameStartGoal,
  isEn,
  displayOutboundRoute,
  displayReturnRoute,
  displayOutboundShuttle,
  visaInfo,
}: AccessInfoProps) {
  return (
    <>
      {/* どうやって行く？ / Venue Access */}
      <SectionCard title={isVenueAccess(outbound) ? 'Venue Access' : (isEn ? 'How to get there?' : 'どうやって行く？')} icon={<Train className="h-4 w-4 text-primary" />}>
        {isVenueAccess(outbound) ? (
          /* venue_access mode: show airports/stations as DL rows */
          (() => {
            const venueData = parseVenueAccessJson(outbound?.route_detail_en)
            if (venueData) {
              return (
                <dl className="grid grid-cols-[minmax(120px,1fr)_minmax(180px,2fr)] gap-x-6 gap-y-3 text-sm">
                  {venueData.airport_1_name && (
                    <>
                      <DLRow label="Nearest Airport" value={venueData.airport_1_name} eventId={eventId} categoryId={categoryId} />
                      <DLRow label="Airport to Venue" value={venueData.airport_1_access || null} multiline eventId={eventId} categoryId={categoryId} />
                      <DLRow label="Cost" value={venueData.airport_1_cost} eventId={eventId} categoryId={categoryId} />
                    </>
                  )}
                  {venueData.airport_2_name && (
                    <>
                      <DLRow label="Alternative Airport" value={venueData.airport_2_name} eventId={eventId} categoryId={categoryId} />
                      <DLRow label="Airport to Venue" value={venueData.airport_2_access || null} multiline eventId={eventId} categoryId={categoryId} />
                      <DLRow label="Cost" value={venueData.airport_2_cost} eventId={eventId} categoryId={categoryId} />
                    </>
                  )}
                  {venueData.station_name && (
                    <>
                      <DLRow label="Nearest Station" value={venueData.station_name} eventId={eventId} categoryId={categoryId} />
                      <DLRow label="Station to Venue" value={venueData.station_access || null} multiline eventId={eventId} categoryId={categoryId} />
                      <DLRow label="Cost" value={venueData.station_cost} eventId={eventId} categoryId={categoryId} />
                    </>
                  )}
                  {displayOutboundShuttle && (
                    <DLRow label="Shuttle bus?" value={displayOutboundShuttle} eventId={eventId} categoryId={categoryId} />
                  )}
                </dl>
              )
            }
            // Fallback: display raw text for old-format data
            return (
              <div className="space-y-3 text-sm">
                {displayOutboundRoute ? (
                  <pre className="whitespace-pre-wrap font-sans leading-relaxed text-foreground">{displayOutboundRoute}</pre>
                ) : (
                  <p className="italic text-muted-foreground/60">{'\u2014'}</p>
                )}
              </div>
            )
          })()
        ) : (
          /* tokyo origin mode: outbound/return */
          <>
            <h3 className="mb-2 text-sm font-semibold text-foreground">{isEn ? 'Outbound' : '往路'}</h3>
            <dl className="grid grid-cols-[minmax(120px,1fr)_minmax(180px,2fr)] gap-x-6 gap-y-3 text-sm">
              <DLRow label={isEn ? 'Route?' : 'どのルートで行く？'} value={displayOutboundRoute} multiline eventId={eventId} categoryId={categoryId} />
              <DLRow label={isEn ? 'Travel time?' : '所要時間は？'} value={outbound?.total_time_estimate} eventId={eventId} categoryId={categoryId} />
              <DLRow label={isEn ? 'Cost estimate?' : '費用の目安は？'} value={isEn ? costStringToUsd(outbound?.cost_estimate) : outbound?.cost_estimate} eventId={eventId} categoryId={categoryId} />
              <DLRow label={isEn ? 'Cash needed?' : '現金は必要？'} value={outbound?.cash_required != null ? (outbound.cash_required ? (isEn ? 'Yes' : 'あり') : (isEn ? 'No' : 'なし')) : null} eventId={eventId} categoryId={categoryId} />
              <dt className="text-muted-foreground">{isEn ? 'Booking site?' : '予約サイトは？'}</dt>
              <dd className={outbound?.booking_url ? '' : 'italic text-muted-foreground/60'}>
                {outbound?.booking_url
                  ? <a href={outbound.booking_url} target="_blank" rel="noreferrer" className="break-all text-primary hover:underline">{outbound.booking_url}</a>
                  : '\u2014'}
              </dd>
              <DLRow label={isEn ? 'Shuttle bus?' : 'シャトルバスはある？'} value={displayOutboundShuttle} eventId={eventId} categoryId={categoryId} />
              <DLRow label={isEn ? 'Taxi?' : 'タクシーは？'} value={outbound?.taxi_estimate} eventId={eventId} categoryId={categoryId} />
            </dl>
            {sameStartGoal ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {isEn ? 'Start and finish are at the same location. Return route is the same as outbound.' : 'スタート・ゴール同一のため、復路は往路と同様です。'}
              </p>
            ) : (
              <>
                <h3 className="mb-2 mt-4 text-sm font-semibold text-foreground">{isEn ? 'Return' : '復路'}</h3>
                <dl className="grid grid-cols-[minmax(120px,1fr)_minmax(180px,2fr)] gap-x-6 gap-y-3 text-sm">
                  <DLRow label={isEn ? 'Route?' : 'どのルートで行く？'} value={displayReturnRoute} multiline eventId={eventId} categoryId={categoryId} />
                  <DLRow label={isEn ? 'Travel time?' : '所要時間は？'} value={returnRoute?.total_time_estimate} eventId={eventId} categoryId={categoryId} />
                  <DLRow label={isEn ? 'Cost estimate?' : '費用の目安は？'} value={isEn ? costStringToUsd(returnRoute?.cost_estimate) : returnRoute?.cost_estimate} eventId={eventId} categoryId={categoryId} />
                </dl>
              </>
            )}
          </>
        )}
        {visaInfo && !isEn && (
          <dl className="mt-3 grid grid-cols-[minmax(120px,1fr)_minmax(180px,2fr)] gap-x-6 gap-y-3 border-t border-border pt-3 text-sm">
            <DLRow label={isEn ? 'Visa?' : 'ビザは必要？'} value={visaInfo} eventId={eventId} categoryId={categoryId} />
          </dl>
        )}
      </SectionCard>
    </>
  )
}

export default AccessInfo
