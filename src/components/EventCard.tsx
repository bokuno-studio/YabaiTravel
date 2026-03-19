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

  if (!isEnriched) {
    return (
      <Card className={cn(
        'overflow-hidden border-border/60 opacity-60 py-0',
      )}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-semibold text-foreground">
                {event.name}
              </h3>
              <div className="mt-1 flex items-center gap-4 text-sm text-muted-foreground">
                {dateText && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 shrink-0" />
                    {dateText}
                  </span>
                )}
                {event.country && <span>{event.country}</span>}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge
                variant="outline"
                className={cn('border text-xs', raceTypeColors[event.race_type ?? 'other'])}
              >
                {raceTypeLabel(event.race_type)}
              </Badge>
              <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-xs">
                {t('event.pending')}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn(
      'group overflow-hidden border-border/60 transition-all duration-200 hover:border-primary/40 hover:shadow-md py-0',
    )}>
      <CardContent className="p-0">
        <Link to={cardLink} className="block p-4 no-underline">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-foreground transition-colors group-hover:text-primary">
                {event.name}
              </h3>
              <div className="mt-2 space-y-1">
                {dateText && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                    <span>{dateText}</span>
                  </div>
                )}
                {(event.country || event.location) && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                    <span>
                      {event.country && event.location
                        ? `${event.country} / ${event.location}`
                        : event.country || event.location}
                    </span>
                  </div>
                )}
                {entryPeriod && (
                  <p className="text-xs text-muted-foreground">
                    {t('event.entry')}: {entryPeriod}
                  </p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <Badge
                variant="outline"
                className={cn('border text-xs', raceTypeColors[event.race_type ?? 'other'])}
              >
                {raceTypeLabel(event.race_type)}
              </Badge>
              {costEstimate && (
                <div className="flex items-center gap-1 text-sm font-semibold text-primary">
                  <Banknote className="h-3.5 w-3.5" />
                  <span>{lang === 'en' ? 'Est.' : '目安'} {costEstimate}</span>
                </div>
              )}
            </div>
          </div>
        </Link>

        {chipsToShow.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t border-border/40 px-4 py-2.5">
            {chipsToShow.map((cat) => (
              <Link
                key={cat.id}
                to={`${langPrefix}/events/${event.id}/categories/${cat.id}`}
                className={cn(
                  'inline-flex items-center rounded-md border border-border/60 bg-secondary/50 px-2 py-0.5',
                  'text-xs text-secondary-foreground no-underline transition-colors',
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
