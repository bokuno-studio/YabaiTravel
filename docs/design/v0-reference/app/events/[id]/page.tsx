'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  ArrowLeft, 
  Calendar, 
  MapPin, 
  Clock, 
  Train, 
  Home, 
  DollarSign,
  Mountain,
  Trophy,
  AlertCircle,
  ArrowRight
} from 'lucide-react'
import { events, raceTypeLabels, entryStatusLabels } from '@/lib/data'
import type { RaceEvent, AccessRoute } from '@/lib/types'
import { cn } from '@/lib/utils'

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

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [locale, setLocale] = useState<'en' | 'ja'>('en')
  const [isLoading, setIsLoading] = useState(true)
  const [event, setEvent] = useState<RaceEvent | null>(null)

  useEffect(() => {
    const foundEvent = events.find(e => e.id === id)
    setEvent(foundEvent || null)
    const timer = setTimeout(() => setIsLoading(false), 500)
    return () => clearTimeout(timer)
  }, [id])

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    if (locale === 'ja') {
      return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
    }
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
  }

  const formatCurrency = (amount: number) => {
    return `¥${amount.toLocaleString()}`
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header locale={locale} onLocaleChange={setLocale} />
        <main className="mx-auto max-w-5xl px-4 py-6 md:px-6">
          <Skeleton className="mb-6 h-8 w-32" />
          <Skeleton className="mb-4 h-48 w-full rounded-xl" />
          <div className="space-y-4">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-40 w-full" />
          </div>
        </main>
      </div>
    )
  }

  if (!event) {
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
              {locale === 'ja' ? 'イベントが見つかりません' : 'Event Not Found'}
            </h1>
            <p className="mt-2 text-muted-foreground">
              {locale === 'ja' ? 'お探しのイベントは存在しません' : "The event you're looking for doesn't exist"}
            </p>
            <Button asChild className="mt-6">
              <Link href="/">{locale === 'ja' ? 'イベント一覧へ' : 'View All Events'}</Link>
            </Button>
          </div>
        </main>
      </div>
    )
  }

  const displayName = locale === 'ja' && event.nameJa ? event.nameJa : event.name
  const displayLocation = locale === 'ja' && event.locationJa ? event.locationJa : event.location
  const displayDescription = locale === 'ja' && event.descriptionJa ? event.descriptionJa : event.description

  return (
    <div className="min-h-screen bg-background">
      <Header locale={locale} onLocaleChange={setLocale} />
      
      <main className="mx-auto max-w-5xl px-4 py-6 md:px-6">
        {/* Back Button */}
        <Button variant="ghost" onClick={() => router.back()} className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          {locale === 'ja' ? '戻る' : 'Back'}
        </Button>

        {/* Hero Section */}
        <div className="mb-8 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-background p-6 shadow-sm md:p-8">
          <div className="flex flex-wrap items-start gap-3">
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
          
          <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
            {displayName}
          </h1>
          
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              <span>{formatDate(event.date)}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              <span>{displayLocation}</span>
            </div>
          </div>

          {event.estimatedTotalCost && (
            <div className="mt-6 inline-flex items-center gap-3 rounded-lg bg-primary/10 px-4 py-3">
              <DollarSign className="h-5 w-5 text-primary" />
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  {locale === 'ja' ? '推定総費用' : 'Estimated Total Cost'}
                </div>
                <div className="text-lg font-bold text-primary">
                  {formatCurrency(event.estimatedTotalCost.min)} - {formatCurrency(event.estimatedTotalCost.max)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tabs Section */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="overview">
              {locale === 'ja' ? '概要' : 'Overview'}
            </TabsTrigger>
            <TabsTrigger value="categories">
              {locale === 'ja' ? 'カテゴリー' : 'Categories'}
            </TabsTrigger>
            <TabsTrigger value="access">
              {locale === 'ja' ? 'アクセス' : 'Access'}
            </TabsTrigger>
            <TabsTrigger value="accommodation">
              {locale === 'ja' ? '宿泊' : 'Accommodation'}
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {displayDescription && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    {locale === 'ja' ? 'イベント説明' : 'Event Description'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">{displayDescription}</p>
                </CardContent>
              </Card>
            )}

            {event.qualification && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-primary" />
                    {locale === 'ja' ? '参加資格' : 'Qualification'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{event.qualification}</p>
                </CardContent>
              </Card>
            )}

            {/* Quick Stats */}
            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="bg-secondary/30">
                <CardContent className="flex flex-col items-center justify-center p-6 text-center">
                  <Mountain className="h-8 w-8 text-primary" />
                  <div className="mt-2 text-2xl font-bold">{event.categories.length}</div>
                  <div className="text-sm text-muted-foreground">
                    {locale === 'ja' ? 'カテゴリー' : 'Categories'}
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-secondary/30">
                <CardContent className="flex flex-col items-center justify-center p-6 text-center">
                  <DollarSign className="h-8 w-8 text-primary" />
                  <div className="mt-2 text-2xl font-bold">
                    {formatCurrency(event.categories[0]?.entryFee || 0)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {locale === 'ja' ? '最低エントリー費' : 'From Entry Fee'}
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-secondary/30">
                <CardContent className="flex flex-col items-center justify-center p-6 text-center">
                  <Clock className="h-8 w-8 text-primary" />
                  <div className="mt-2 text-2xl font-bold">
                    {event.categories[0]?.timeLimit || '-'}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {locale === 'ja' ? '制限時間' : 'Time Limit'}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Categories Tab */}
          <TabsContent value="categories" className="space-y-4">
            {event.categories.map((category) => (
              <Card key={category.id} className="overflow-hidden transition-all hover:border-primary/50">
                <CardContent className="p-0">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                    <div className="flex-1 p-6">
                      <h3 className="text-xl font-bold">{category.name}</h3>
                      {category.description && (
                        <p className="mt-1 text-sm text-muted-foreground">{category.description}</p>
                      )}
                      
                      <div className="mt-4 grid gap-2 sm:grid-cols-2 md:grid-cols-4">
                        <div>
                          <div className="text-xs uppercase tracking-wider text-muted-foreground">
                            {locale === 'ja' ? '距離' : 'Distance'}
                          </div>
                          <div className="font-semibold">{category.distance}</div>
                        </div>
                        {category.elevation && (
                          <div>
                            <div className="text-xs uppercase tracking-wider text-muted-foreground">
                              {locale === 'ja' ? '累積標高' : 'Elevation'}
                            </div>
                            <div className="font-semibold">{category.elevation}</div>
                          </div>
                        )}
                        <div>
                          <div className="text-xs uppercase tracking-wider text-muted-foreground">
                            {locale === 'ja' ? '制限時間' : 'Time Limit'}
                          </div>
                          <div className="font-semibold">{category.timeLimit}</div>
                        </div>
                        {category.finishRate !== undefined && (
                          <div>
                            <div className="text-xs uppercase tracking-wider text-muted-foreground">
                              {locale === 'ja' ? '完走率' : 'Finish Rate'}
                            </div>
                            <div className="font-semibold">{category.finishRate}%</div>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-center gap-3 border-t border-border p-6 md:border-l md:border-t-0">
                      <div className="text-center">
                        <div className="text-xs uppercase tracking-wider text-muted-foreground">
                          {locale === 'ja' ? 'エントリー費' : 'Entry Fee'}
                        </div>
                        <div className="text-2xl font-bold text-primary">
                          {formatCurrency(category.entryFee)}
                        </div>
                      </div>
                      <Button asChild size="sm">
                        <Link href={`/events/${event.id}/categories/${category.id}`}>
                          {locale === 'ja' ? '詳細' : 'Details'}
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* Access Tab */}
          <TabsContent value="access" className="space-y-6">
            {event.access && event.access.length > 0 ? (
              <>
                {/* Outbound Routes */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Train className="h-5 w-5 text-primary" />
                    {locale === 'ja' ? '行き (東京から)' : 'Outbound (from Tokyo)'}
                  </h3>
                  {event.access
                    .filter((route) => route.type === 'outbound')
                    .map((route) => (
                      <AccessRouteCard key={route.id} route={route} locale={locale} />
                    ))}
                </div>

                {/* Return Routes */}
                {event.access.some((r) => r.type === 'return') && (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                      <Train className="h-5 w-5 text-primary rotate-180" />
                      {locale === 'ja' ? '帰り' : 'Return'}
                    </h3>
                    {event.access
                      .filter((route) => route.type === 'return')
                      .map((route) => (
                        <AccessRouteCard key={route.id} route={route} locale={locale} />
                      ))}
                  </div>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  {locale === 'ja' ? 'アクセス情報はまだ追加されていません' : 'Access information not yet available'}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Accommodation Tab */}
          <TabsContent value="accommodation" className="space-y-6">
            {event.accommodation ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Home className="h-5 w-5 text-primary" />
                    {locale === 'ja' ? '推奨エリア' : 'Recommended Area'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-lg">{event.accommodation.area}</div>
                      {event.accommodation.recommendation && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {event.accommodation.recommendation}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">
                        {locale === 'ja' ? '平均宿泊費 / 泊' : 'Avg. Cost / Night'}
                      </div>
                      <div className="text-2xl font-bold text-primary">
                        {formatCurrency(event.accommodation.avgCostPerNight)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  {locale === 'ja' ? '宿泊情報はまだ追加されていません' : 'Accommodation information not yet available'}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Last Updated */}
        <div className="mt-8 text-center text-xs text-muted-foreground">
          {locale === 'ja' ? '最終更新: ' : 'Last updated: '}
          {new Date(event.lastUpdated).toLocaleDateString(locale === 'ja' ? 'ja-JP' : 'en-US')}
        </div>
      </main>
    </div>
  )
}

function AccessRouteCard({ route, locale }: { route: AccessRoute; locale: 'en' | 'ja' }) {
  const formatCurrency = (amount: number) => `¥${amount.toLocaleString()}`
  
  return (
    <Card className="bg-secondary/30">
      <CardContent className="p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{route.from}</span>
              <ArrowRight className="h-4 w-4" />
              <span className="font-medium text-foreground">{route.to}</span>
            </div>
            <div className="mt-2 text-sm">
              <span className="font-medium">{route.method}</span>
              <span className="mx-2 text-muted-foreground">|</span>
              <span className="text-muted-foreground">{route.duration}</span>
            </div>
            {route.details && (
              <p className="mt-2 text-sm text-muted-foreground">{route.details}</p>
            )}
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary">{formatCurrency(route.cost)}</div>
            <div className="text-xs text-muted-foreground">
              {locale === 'ja' ? '片道' : 'one way'}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
