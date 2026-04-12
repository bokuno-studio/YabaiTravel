import { useMemo, useState } from 'react'
import { Calendar, ChevronDown, ChevronUp, ExternalLink, Map as MapIcon, MapPin, Ruler } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { EventWithCategories } from '@/types/event'

interface EventCardProps {
  event: EventWithCategories
  raceTypeLabel: (type: string | null) => string
  t: (key: string) => string
  lang: string | undefined
  langPrefix?: string
  cardLink?: string
  chipsToShow?: unknown[]
  isEnriched?: boolean
}

const raceTypeBorders: Record<string, string> = {
  spartan: 'border-t-red-500',
  marathon: 'border-t-blue-500',
  trail: 'border-t-green-500',
  hyrox: 'border-t-amber-500',
  triathlon: 'border-t-cyan-500',
  obstacle: 'border-t-rose-500',
  tough_mudder: 'border-t-rose-500',
  bike: 'border-t-teal-500',
  cycling: 'border-t-teal-500',
  duathlon: 'border-t-purple-500',
  rogaining: 'border-t-lime-500',
  adventure: 'border-t-orange-500',
  devils_circuit: 'border-t-red-500',
  strong_viking: 'border-t-red-500',
  total_warrior: 'border-t-orange-600',
  ultra: 'border-t-violet-500',
  other: 'border-t-gray-400',
}

const raceTypeBadgeBg: Record<string, string> = {
  spartan: 'bg-red-500 text-white border-red-500',
  marathon: 'bg-blue-500 text-white border-blue-500',
  trail: 'bg-green-500 text-white border-green-500',
  hyrox: 'bg-amber-500 text-white border-amber-500',
  triathlon: 'bg-cyan-500 text-white border-cyan-500',
  obstacle: 'bg-rose-500 text-white border-rose-500',
  tough_mudder: 'bg-rose-500 text-white border-rose-500',
  bike: 'bg-teal-500 text-white border-teal-500',
  cycling: 'bg-teal-500 text-white border-teal-500',
  duathlon: 'bg-purple-500 text-white border-purple-500',
  rogaining: 'bg-lime-500 text-white border-lime-500',
  adventure: 'bg-orange-500 text-white border-orange-500',
  devils_circuit: 'bg-red-500 text-white border-red-500',
  strong_viking: 'bg-red-500 text-white border-red-500',
  total_warrior: 'bg-orange-600 text-white border-orange-600',
  ultra: 'bg-violet-500 text-white border-violet-500',
  other: 'bg-gray-400 text-white border-gray-400',
}

function formatDateWithDay(dateStr: string, isEn: boolean): string {
  const date = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(date.getTime())) return dateStr

  if (isEn) {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      weekday: 'short',
    }).format(date)
  }

  const weekdays = ['日', '月', '火', '水', '木', '金', '土']
  return `${dateStr}（${weekdays[date.getDay()]}）`
}

function formatDateRange(start: string | null, end: string | null, isEn: boolean): string {
  if (!start) return '---'
  if (!end || end === start) return formatDateWithDay(start, isEn)
  return `${formatDateWithDay(start, isEn)} ${isEn ? '-' : '〜'} ${formatDateWithDay(end, isEn)}`
}

type EntryStatus = 'open' | 'not_yet' | 'closed'

function getTodayString(): string {
  return new Date().toISOString().slice(0, 10)
}

function getEntryStatus(event: EventWithCategories): EntryStatus {
  const today = getTodayString()

  if (!event.entry_start || !event.entry_end) return 'closed'
  if (today < event.entry_start) return 'not_yet'
  if (today > event.entry_end) return 'closed'
  return 'open'
}

export function EventCard({
  event,
  raceTypeLabel,
  lang,
}: EventCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const isEn = lang === 'en'

  const displayName = isEn ? (event.name_en ?? event.name) : event.name
  const displayCountry = isEn ? (event.country_en ?? event.country) : event.country
  const displayLocation = isEn ? (event.location_en ?? event.location) : event.location
  const description = (isEn ? (event.description_en ?? event.description) : event.description)?.trim() ?? ''
  const entryStatus = getEntryStatus(event)

  const entryStatusConfig = {
    open: {
      badge: isEn ? 'Open' : '受付中',
      button: isEn ? 'Go to entry page' : '申込ページへ',
      badgeClass: 'bg-green-500 text-white border-green-500',
      buttonEnabled: Boolean(event.entry_url),
    },
    not_yet: {
      badge: isEn ? 'Not yet open' : '受付前',
      button: isEn ? 'Entry not open yet' : '申込開始前',
      badgeClass: 'bg-amber-500 text-white border-amber-500',
      buttonEnabled: false,
    },
    closed: {
      badge: isEn ? 'Closed' : '受付終了',
      button: isEn ? 'Entry closed' : '申込終了',
      badgeClass: 'bg-red-500 text-white border-red-500',
      buttonEnabled: false,
    },
  } as const

  const distances = useMemo(() => {
    const values = (event.categories ?? [])
      .map((category) => category.distance_km)
      .filter((distance): distance is number => distance != null)
      .sort((a, b) => a - b)

    if (values.length === 0) return '---'
    return [...new Set(values)].map((distance) => `${distance}km`).join(', ')
  }, [event.categories])

  const descriptionPreview = description
    ? description.length > 100
      ? `${description.slice(0, 100)}...`
      : description
    : (isEn ? 'No description available.' : '紹介文はありません。')
  const hasExpandableDescription = description.length > 100
  const mapsHref = event.latitude != null && event.longitude != null
    ? `https://www.google.com/maps?q=${event.latitude},${event.longitude}`
    : null

  const borderColor = raceTypeBorders[event.race_type ?? 'other'] ?? raceTypeBorders.other
  const badgeBg = raceTypeBadgeBg[event.race_type ?? 'other'] ?? raceTypeBadgeBg.other
  const status = entryStatusConfig[entryStatus]

  return (
    <Card
      className={cn(
        'flex h-full flex-col overflow-hidden border-t-4 bg-white py-0 shadow-sm transition-all duration-200 hover:shadow-lg',
        borderColor,
      )}
    >
      <CardContent className="flex flex-1 flex-col gap-4 p-5">
        <div className="space-y-2">
          <p className="line-clamp-2 text-lg font-bold leading-tight text-foreground">
            {displayName}
          </p>
          <Badge className={cn('w-fit text-[10px] uppercase', badgeBg)}>
            {raceTypeLabel(event.race_type)}
          </Badge>
          <Badge className={cn('w-fit text-[10px]', status.badgeClass)}>
            {status.badge}
          </Badge>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex items-start gap-2 text-muted-foreground">
            <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>{formatDateRange(event.event_date, event.event_date_end ?? null, isEn)}</span>
          </div>

          <div className="flex items-start gap-2 text-muted-foreground">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>{[displayCountry, displayLocation].filter(Boolean).join(' / ') || '---'}</span>
          </div>

          <div className="flex items-start gap-2 text-muted-foreground">
            <Ruler className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span className="text-foreground">{distances}</span>
          </div>
        </div>

        <div className="border-t border-border/50 pt-4">
          <p className="text-sm leading-relaxed text-foreground/85">
            {isExpanded ? description || descriptionPreview : descriptionPreview}
          </p>
          {hasExpandableDescription && (
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary transition-colors hover:text-primary/80"
              aria-expanded={isExpanded}
            >
              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {isExpanded
                ? (isEn ? 'Show less' : '折りたたむ')
                : (isEn ? 'Show more' : '続きを読む')}
            </button>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex flex-col items-stretch gap-3 border-t border-border/40 p-5">
        <Button
          type="button"
          disabled={!status.buttonEnabled}
          onClick={() => {
            if (event.entry_url) window.open(event.entry_url, '_blank', 'noopener,noreferrer')
          }}
          className="w-full font-semibold"
        >
          {status.button}
        </Button>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {event.official_url ? (
            <a
              href={event.official_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
            >
              <ExternalLink className="h-4 w-4" />
              {isEn ? 'Official site' : '公式サイト'}
            </a>
          ) : (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <ExternalLink className="h-4 w-4" />
              {isEn ? 'Official site unavailable' : '公式サイトなし'}
            </span>
          )}

          {mapsHref ? (
            <a
              href={mapsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
            >
              <MapIcon className="h-4 w-4" />
              Google Maps
            </a>
          ) : (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <MapIcon className="h-4 w-4" />
              {isEn ? 'Map unavailable' : '地図なし'}
            </span>
          )}
        </div>
      </CardFooter>
    </Card>
  )
}
