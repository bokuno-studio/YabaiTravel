'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  Breadcrumb, 
  BreadcrumbItem, 
  BreadcrumbLink, 
  BreadcrumbList, 
  BreadcrumbPage, 
  BreadcrumbSeparator 
} from '@/components/ui/breadcrumb'
import { 
  ArrowLeft, 
  ArrowRight,
  Mountain, 
  Clock, 
  TrendingUp,
  Target,
  DollarSign,
  Train,
  Home,
  AlertCircle,
  ChevronRight,
  CheckCircle2
} from 'lucide-react'
import { events, raceTypeLabels } from '@/lib/data'
import type { RaceEvent, RaceCategory, AccessRoute } from '@/lib/types'
import { cn } from '@/lib/utils'

const raceTypeColors: Record<string, string> = {
  trail: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  hyrox: 'bg-amber-100 text-amber-700 border-amber-200',
  spartan: 'bg-rose-100 text-rose-700 border-rose-200',
  marathon: 'bg-sky-100 text-sky-700 border-sky-200',
  ultra: 'bg-violet-100 text-violet-700 border-violet-200',
  triathlon: 'bg-teal-100 text-teal-700 border-teal-200'
}

export default function CategoryDetailPage({ 
  params 
}: { 
  params: Promise<{ id: string; categoryId: string }> 
}) {
  const { id, categoryId } = use(params)
  const router = useRouter()
  const [locale, setLocale] = useState<'en' | 'ja'>('en')
  const [isLoading, setIsLoading] = useState(true)
  const [event, setEvent] = useState<RaceEvent | null>(null)
  const [category, setCategory] = useState<RaceCategory | null>(null)

  useEffect(() => {
    const foundEvent = events.find(e => e.id === id)
    if (foundEvent) {
      const foundCategory = foundEvent.categories.find(c => c.id === categoryId)
      setEvent(foundEvent)
      setCategory(foundCategory || null)
    }
    const timer = setTimeout(() => setIsLoading(false), 500)
    return () => clearTimeout(timer)
  }, [id, categoryId])

  const formatCurrency = (amount: number) => `¥${amount.toLocaleString()}`

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header locale={locale} onLocaleChange={setLocale} />
        <main className="mx-auto max-w-5xl px-4 py-6 md:px-6">
          <Skeleton className="mb-6 h-6 w-64" />
          <Skeleton className="mb-4 h-12 w-3/4" />
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </main>
      </div>
    )
  }

  if (!event || !category) {
    return (
      <div className="min-h-screen bg-background">
        <Header locale={locale} onLocaleChange={setLocale} />
        <main className="mx-auto max-w-5xl px-4 py-6 md:px-6">
          <Button variant="ghost" onClick={() => router.back()} className="mb-6">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {locale === 'ja' ? '戻る' : 'Back'}
          </Button>
          <div className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="h-12 w-12 text-muted-foreground" />
            <h1 className="mt-4 text-2xl font-bold">
              {locale === 'ja' ? 'カテゴリーが見つかりません' : 'Category Not Found'}
            </h1>
            <Button asChild className="mt-6">
              <Link href={`/events/${id}`}>{locale === 'ja' ? 'イベント詳細へ' : 'Back to Event'}</Link>
            </Button>
          </div>
        </main>
      </div>
    )
  }

  const displayName = locale === 'ja' && event.nameJa ? event.nameJa : event.name

  // Calculate total estimated cost
  const transportCost = event.access 
    ? event.access.reduce((sum, route) => sum + route.cost, 0)
    : 0
  const accommodationCost = event.accommodation?.avgCostPerNight || 0
  const totalEstimatedCost = category.entryFee + transportCost + (accommodationCost * 2) // Assume 2 nights

  return (
    <div className="min-h-screen bg-background">
      <Header locale={locale} onLocaleChange={setLocale} />
      
      <main className="mx-auto max-w-5xl px-4 py-6 md:px-6">
        {/* Breadcrumb */}
        <Breadcrumb className="mb-6">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">
                {locale === 'ja' ? 'イベント' : 'Events'}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href={`/events/${event.id}`}>
                {displayName}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{category.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-3">
            <Badge 
              variant="outline" 
              className={cn('border', raceTypeColors[event.raceType])}
            >
              {raceTypeLabels[event.raceType]?.[locale] ?? event.raceType}
            </Badge>
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
            {category.name}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {displayName}
          </p>
          {category.description && (
            <p className="mt-2 text-muted-foreground">{category.description}</p>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Specs Table */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                {locale === 'ja' ? 'レーススペック' : 'Race Specs'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border">
                <SpecRow 
                  icon={<Mountain className="h-5 w-5" />}
                  label={locale === 'ja' ? '距離' : 'Distance'} 
                  value={category.distance} 
                />
                {category.elevation && (
                  <SpecRow 
                    icon={<TrendingUp className="h-5 w-5" />}
                    label={locale === 'ja' ? '累積標高' : 'Elevation Gain'} 
                    value={category.elevation} 
                  />
                )}
                <SpecRow 
                  icon={<Clock className="h-5 w-5" />}
                  label={locale === 'ja' ? '制限時間' : 'Time Limit'} 
                  value={category.timeLimit} 
                />
                {category.finishRate !== undefined && (
                  <SpecRow 
                    icon={<CheckCircle2 className="h-5 w-5" />}
                    label={locale === 'ja' ? '完走率' : 'Finish Rate'} 
                    value={`${category.finishRate}%`} 
                    highlight
                  />
                )}
              </div>

              {/* Cutoff Times */}
              {category.cutoffs && category.cutoffs.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    {locale === 'ja' ? '関門時刻' : 'Cutoff Times'}
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {category.cutoffs.map((cutoff, index) => (
                      <Badge key={index} variant="secondary" className="font-mono">
                        {cutoff}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Total Cost Breakdown */}
          <Card className="bg-primary/5 border-primary/20 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-primary" />
                {locale === 'ja' ? '費用明細' : 'Cost Breakdown'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <CostRow 
                label={locale === 'ja' ? 'エントリー費' : 'Entry Fee'} 
                amount={category.entryFee} 
              />
              <CostRow 
                label={locale === 'ja' ? '交通費 (往復)' : 'Transport (round trip)'} 
                amount={transportCost} 
              />
              <CostRow 
                label={locale === 'ja' ? '宿泊費 (2泊)' : 'Accommodation (2 nights)'} 
                amount={accommodationCost * 2} 
              />
              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    {locale === 'ja' ? '推定合計' : 'Estimated Total'}
                  </span>
                  <span className="text-2xl font-bold text-primary">
                    {formatCurrency(totalEstimatedCost)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {locale === 'ja' 
                    ? '※実際の費用は異なる場合があります' 
                    : '* Actual costs may vary'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Access Routes */}
        {event.access && event.access.length > 0 && (
          <div className="mt-8 space-y-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Train className="h-5 w-5 text-primary" />
              {locale === 'ja' ? 'アクセスルート' : 'Access Routes'}
            </h2>
            
            <div className="grid gap-4 md:grid-cols-2">
              {/* Outbound */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
                    {locale === 'ja' ? '行き' : 'Outbound'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {event.access
                    .filter(r => r.type === 'outbound')
                    .map((route) => (
                      <RouteCard key={route.id} route={route} />
                    ))}
                </CardContent>
              </Card>

              {/* Return */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
                    {locale === 'ja' ? '帰り' : 'Return'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {event.access
                    .filter(r => r.type === 'return')
                    .map((route) => (
                      <RouteCard key={route.id} route={route} />
                    ))}
                  {event.access.filter(r => r.type === 'return').length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      {locale === 'ja' ? '行きと同じルート' : 'Same as outbound'}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Accommodation */}
        {event.accommodation && (
          <div className="mt-8">
            <h2 className="text-xl font-bold flex items-center gap-2 mb-4">
              <Home className="h-5 w-5 text-primary" />
              {locale === 'ja' ? '宿泊' : 'Accommodation'}
            </h2>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold">{event.accommodation.area}</h3>
                    {event.accommodation.recommendation && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {event.accommodation.recommendation}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">
                      {locale === 'ja' ? '平均宿泊費' : 'Avg. Cost / Night'}
                    </div>
                    <div className="text-2xl font-bold text-primary">
                      {formatCurrency(event.accommodation.avgCostPerNight)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Back to Event Button */}
        <div className="mt-8 flex justify-center">
          <Button asChild variant="outline">
            <Link href={`/events/${event.id}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {locale === 'ja' ? 'イベント詳細へ戻る' : 'Back to Event Details'}
            </Link>
          </Button>
        </div>
      </main>
    </div>
  )
}

function SpecRow({ 
  icon, 
  label, 
  value, 
  highlight = false 
}: { 
  icon: React.ReactNode
  label: string
  value: string
  highlight?: boolean 
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-muted-foreground">{label}</span>
      </div>
      <span className={cn(
        "font-semibold",
        highlight && "text-primary"
      )}>
        {value}
      </span>
    </div>
  )
}

function CostRow({ label, amount }: { label: string; amount: number }) {
  const formatCurrency = (value: number) => `¥${value.toLocaleString()}`
  
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{formatCurrency(amount)}</span>
    </div>
  )
}

function RouteCard({ route }: { route: AccessRoute }) {
  const formatCurrency = (amount: number) => `¥${amount.toLocaleString()}`
  
  return (
    <div className="rounded-xl bg-secondary/80 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{route.from}</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{route.to}</span>
        </div>
        <span className="font-semibold text-primary">{formatCurrency(route.cost)}</span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {route.method} | {route.duration}
      </div>
    </div>
  )
}
