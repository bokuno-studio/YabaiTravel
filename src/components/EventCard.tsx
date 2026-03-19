import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar, MapPin, Banknote } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EventWithCategories, Category } from '@/types/event'

interface EventCardProps {
  event: EventWithCategories
  langPrefix: string
  raceTypeLabel: (type: string | null) => string
  cardLink: string
  chipsToShow: Category[]
  isEnriched: boolean
  t: (key: string) => string
  lang: string | undefined
}

/** Top border color per race type */
const raceTypeBorders: Record<string, string> = {
  spartan: 'border-t-red-500',
  marathon: 'border-t-blue-500',
  trail: 'border-t-green-500',
  hyrox: 'border-t-amber-500',
  triathlon: 'border-t-cyan-500',
  obstacle: 'border-t-rose-500',
  tough_mudder: 'border-t-rose-500',
  cycling: 'border-t-teal-500',
  duathlon: 'border-t-purple-500',
  rogaining: 'border-t-lime-500',
  adventure: 'border-t-orange-500',
  devils_circuit: 'border-t-red-500',
  strong_viking: 'border-t-red-500',
  ultra: 'border-t-violet-500',
  other: 'border-t-gray-400',
}

/** Badge background color per race type */
const raceTypeBadgeBg: Record<string, string> = {
  spartan: 'bg-red-500 text-white border-red-500',
  marathon: 'bg-blue-500 text-white border-blue-500',
  trail: 'bg-green-500 text-white border-green-500',
  hyrox: 'bg-amber-500 text-white border-amber-500',
  triathlon: 'bg-cyan-500 text-white border-cyan-500',
  obstacle: 'bg-rose-500 text-white border-rose-500',
  tough_mudder: 'bg-rose-500 text-white border-rose-500',
  cycling: 'bg-teal-500 text-white border-teal-500',
  duathlon: 'bg-purple-500 text-white border-purple-500',
  rogaining: 'bg-lime-500 text-white border-lime-500',
  adventure: 'bg-orange-500 text-white border-orange-500',
  devils_circuit: 'bg-red-500 text-white border-red-500',
  strong_viking: 'bg-red-500 text-white border-red-500',
  ultra: 'bg-violet-500 text-white border-violet-500',
  other: 'bg-gray-400 text-white border-gray-400',
}

/** Format date with day of week */
function formatDateWithDay(dateStr: string): string {
  const days = ['日', '月', '火', '水', '木', '金', '土']
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return dateStr
  return `${dateStr}（${days[d.getDay()]}）`
}

export function EventCard({
  event,
  langPrefix,
  raceTypeLabel,
  cardLink,
  chipsToShow,
  isEnriched,
  t,
  lang,
}: EventCardProps) {
  const isEn = lang === 'en'

  // #8: Prefer _en fields for English pages, fallback to Japanese
  const displayCountry = isEn ? (event.country_en ?? event.country) : event.country
  const displayLocation = isEn ? (event.location_en ?? event.location) : event.location

  const dateText = event.event_date_end && event.event_date && event.event_date_end !== event.event_date
    ? `${formatDateWithDay(event.event_date)}〜${formatDateWithDay(event.event_date_end)}`
    : event.event_date ? formatDateWithDay(event.event_date) : null

  const entryPeriod = (() => {
    if (event.entry_start && event.entry_end) return `${event.entry_start}〜${event.entry_end}`
    if (event.entry_start_typical && event.entry_end_typical) return `${event.entry_start_typical}〜${event.entry_end_typical}`
    return null
  })()

  const costEstimate = event.total_cost_estimate
    ? `¥${parseInt(event.total_cost_estimate, 10).toLocaleString()}`
    : null

  const borderColor = raceTypeBorders[event.race_type ?? 'other'] ?? raceTypeBorders.other
  const badgeBg = raceTypeBadgeBg[event.race_type ?? 'other'] ?? raceTypeBadgeBg.other

  if (!isEnriched) {
    return (
      <Card className={cn(
        'overflow-hidden border-t-4 bg-white shadow-sm opacity-60 py-0',
        borderColor,
      )}>
        <CardContent className="p-4">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {event.name}
          </h3>
          <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
            {dateText && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3 shrink-0" />
                {dateText}
              </span>
            )}
            {displayCountry && <span>{displayCountry}</span>}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn(
      'group overflow-hidden border-t-4 bg-white shadow-sm py-0 flex flex-col',
      borderColor,
      'transition-all duration-200 hover:shadow-md',
    )}>
      <CardContent className="flex flex-1 flex-col p-0">
        <Link to={cardLink} className="block flex-1 no-underline">
          <div className="flex h-full flex-col p-4">
            {/* 1. Race type badge (top-left, small) */}
            <div className="mb-2">
              <Badge
                className={cn('shrink-0 text-[10px] px-1.5 py-0.5', badgeBg)}
              >
                {raceTypeLabel(event.race_type)}
              </Badge>
            </div>

            {/* 2. Event name (bold, 2 lines max) */}
            <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-snug mb-2">
              {event.name}
            </h3>

            {/* 3-4. Date and Location */}
            <div className="space-y-1 mb-auto">
              {/* 3. Date with day of week */}
              {dateText && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3 shrink-0 text-primary/70" />
                  <span>{dateText}</span>
                </div>
              )}
              {/* 4. Location (country / city) */}
              {(displayCountry || displayLocation) && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0 text-primary/70" />
                  <span className="truncate">
                    {displayCountry && displayLocation
                      ? `${displayCountry} / ${displayLocation}`
                      : displayCountry || displayLocation}
                  </span>
                </div>
              )}
            </div>

            {/* 5-6. Entry period + Cost estimate - stacked vertically */}
            <div className="mt-2 space-y-1">
              {entryPeriod && (
                <p className="text-[11px] text-muted-foreground leading-tight">
                  {t('event.entry')}: {entryPeriod}
                </p>
              )}
              {costEstimate && (
                <div className="flex items-center gap-1 text-xs font-semibold text-primary">
                  <Banknote className="h-3 w-3" />
                  <span>{lang === 'en' ? 'Est.' : '目安'} {costEstimate}</span>
                </div>
              )}
            </div>
          </div>
        </Link>

        {/* 7. Category chips (bottom, separate border-t section) */}
        {chipsToShow.length > 0 && (
          <div className="flex flex-wrap gap-1 border-t border-border/40 px-3 py-2">
            {chipsToShow.map((cat) => (
              <Link
                key={cat.id}
                to={`${langPrefix}/events/${event.id}/categories/${cat.id}`}
                className={cn(
                  'inline-flex items-center rounded-md border border-border/60 bg-secondary/50 px-2 py-0.5',
                  'text-[11px] text-secondary-foreground no-underline transition-colors',
                  'hover:border-primary/30 hover:bg-primary/5 hover:text-primary',
                )}
                title={
                  cat.distance_km != null || cat.elevation_gain != null
                    ? `${cat.distance_km != null ? `${cat.distance_km}km` : ''} ${cat.elevation_gain != null ? `D+${cat.elevation_gain}m` : ''}`.trim()
                    : undefined
                }
              >
                {cat.name}
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
