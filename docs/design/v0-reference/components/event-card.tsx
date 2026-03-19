'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar, MapPin, ArrowRight, Mountain, Timer } from 'lucide-react'
import { raceTypeLabels, entryStatusLabels } from '@/lib/data'
import type { RaceEvent } from '@/lib/types'
import { cn } from '@/lib/utils'

interface EventCardProps {
  event: RaceEvent
  locale: 'en' | 'ja'
}

const raceTypeColors: Record<string, string> = {
  trail: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  hyrox: 'bg-amber-100 text-amber-700 border-amber-200',
  spartan: 'bg-rose-100 text-rose-700 border-rose-200',
  marathon: 'bg-sky-100 text-sky-700 border-sky-200',
  ultra: 'bg-violet-100 text-violet-700 border-violet-200',
  triathlon: 'bg-teal-100 text-teal-700 border-teal-200'
}

const entryStatusColors: Record<string, string> = {
  accepting: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-stone-100 text-stone-500',
  waitlist: 'bg-amber-100 text-amber-700'
}

export function EventCard({ event, locale }: EventCardProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    if (locale === 'ja') {
      return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
    }
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  const formatCurrency = (amount: number) => {
    return `¥${amount.toLocaleString()}`
  }

  const primaryCategory = event.categories[0]
  const displayName = locale === 'ja' && event.nameJa ? event.nameJa : event.name
  const displayLocation = locale === 'ja' && event.locationJa ? event.locationJa : event.location

  return (
    <Card className="group overflow-hidden border-border bg-card transition-all duration-300 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/10">
      <CardContent className="p-0">
        {/* Image Placeholder / Gradient */}
        <div className="relative h-32 bg-gradient-to-br from-secondary via-muted/50 to-background">
          <div className="absolute inset-0 bg-gradient-to-t from-card/80 via-transparent to-transparent" />
          <div className="absolute left-4 top-4 flex gap-2">
            <Badge 
              variant="outline" 
              className={cn('border', raceTypeColors[event.raceType])}
            >
              {raceTypeLabels[event.raceType]?.[locale] ?? event.raceType}
            </Badge>
            <Badge 
              variant="secondary"
              className={entryStatusColors[event.entryStatus]}
            >
              {entryStatusLabels[event.entryStatus]?.[locale]}
            </Badge>
          </div>
        </div>

        <div className="space-y-4 p-4">
          {/* Event Name */}
          <div>
            <h3 className="text-lg font-bold leading-tight text-foreground group-hover:text-primary transition-colors">
              {displayName}
            </h3>
          </div>

          {/* Event Details */}
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4 shrink-0 text-primary" />
              <span>{formatDate(event.date)}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0 text-primary" />
              <span>{displayLocation}</span>
            </div>
            {primaryCategory && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mountain className="h-4 w-4 shrink-0 text-primary" />
                <span>{primaryCategory.distance}</span>
                {primaryCategory.elevation && (
                  <span className="text-xs">({primaryCategory.elevation})</span>
                )}
              </div>
            )}
          </div>

          {/* Cost Estimate */}
          {event.estimatedTotalCost && (
            <div className="rounded-lg bg-secondary/50 p-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {locale === 'ja' ? '推定総費用' : 'Est. Total Cost'}
              </div>
              <div className="mt-1 text-lg font-bold text-primary">
                {formatCurrency(event.estimatedTotalCost.min)} - {formatCurrency(event.estimatedTotalCost.max)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {locale === 'ja' ? 'エントリー + 交通 + 宿泊' : 'Entry + Transport + Stay'}
              </div>
            </div>
          )}

          {/* Action Button */}
          <Button asChild variant="secondary" className="w-full group/btn">
            <Link href={`/events/${event.id}`}>
              {locale === 'ja' ? '詳細を見る' : 'View Details'}
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
