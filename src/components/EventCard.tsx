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

const raceTypeColors: Record<string, string> = {
  trail: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  hyrox: 'bg-amber-50 text-amber-700 border-amber-200',
  spartan: 'bg-rose-50 text-rose-700 border-rose-200',
  marathon: 'bg-sky-50 text-sky-700 border-sky-200',
  ultra: 'bg-violet-50 text-violet-700 border-violet-200',
  triathlon: 'bg-teal-50 text-teal-700 border-teal-200',
  duathlon: 'bg-teal-50 text-teal-700 border-teal-200',
  cycling: 'bg-lime-50 text-lime-700 border-lime-200',
  obstacle: 'bg-orange-50 text-orange-700 border-orange-200',
  tough_mudder: 'bg-orange-50 text-orange-700 border-orange-200',
  rogaining: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  adventure: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  devils_circuit: 'bg-red-50 text-red-700 border-red-200',
  strong_viking: 'bg-red-50 text-red-700 border-red-200',
  other: 'bg-stone-50 text-stone-600 border-stone-200',
}

/** Gradient backgrounds for the image area when no image is available */
const raceTypeGradients: Record<string, string> = {
  spartan: 'from-red-500 to-orange-500',
  marathon: 'from-blue-500 to-cyan-500',
  trail: 'from-green-500 to-emerald-500',
  hyrox: 'from-amber-500 to-yellow-500',
  triathlon: 'from-indigo-500 to-blue-500',
  obstacle: 'from-rose-500 to-pink-500',
  tough_mudder: 'from-rose-500 to-pink-500',
  cycling: 'from-teal-500 to-cyan-500',
  duathlon: 'from-purple-500 to-violet-500',
  rogaining: 'from-lime-500 to-green-500',
  adventure: 'from-orange-500 to-amber-500',
  devils_circuit: 'from-red-500 to-orange-500',
  strong_viking: 'from-red-500 to-orange-500',
  ultra: 'from-violet-500 to-purple-500',
  other: 'from-gray-500 to-slate-500',
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

  const gradient = raceTypeGradients[event.race_type ?? 'other'] ?? raceTypeGradients.other

  if (!isEnriched) {
    return (
      <Card className={cn(
        'overflow-hidden border-border/60 opacity-60 py-0',
      )}>
        {/* Gradient image area */}
        <div className={cn('relative aspect-[16/9] bg-gradient-to-br opacity-40', gradient)}>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-white/60 text-sm font-medium">{t('event.pending')}</span>
          </div>
        </div>
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
            {event.country && <span>{event.country}</span>}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn(
      'group overflow-hidden border-border/60 py-0',
      'transition-all duration-200 hover:shadow-lg hover:scale-[1.02]',
    )}>
      <CardContent className="p-0">
        <Link to={cardLink} className="block no-underline">
          {/* Gradient image area */}
          <div className={cn('relative aspect-[16/9] bg-gradient-to-br', gradient)}>
            <div className="absolute inset-0 flex items-end p-3">
              <span className="text-white/80 text-lg font-bold drop-shadow-sm line-clamp-2 leading-tight">
                {event.name}
              </span>
            </div>
            {/* Badge: absolute top-left */}
            <Badge
              variant="outline"
              className={cn(
                'absolute top-2 left-2 border bg-white/90 text-xs backdrop-blur-sm',
                raceTypeColors[event.race_type ?? 'other'],
              )}
            >
              {raceTypeLabel(event.race_type)}
            </Badge>
          </div>

          {/* Card body */}
          <div className="p-3">
            <div className="space-y-1">
              {dateText && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3 shrink-0 text-primary/70" />
                  <span>{dateText}</span>
                </div>
              )}
              {(event.country || event.location) && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0 text-primary/70" />
                  <span className="truncate">
                    {event.country && event.location
                      ? `${event.country} / ${event.location}`
                      : event.country || event.location}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                {entryPeriod && (
                  <p className="text-[11px] text-muted-foreground">
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
          </div>
        </Link>

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
