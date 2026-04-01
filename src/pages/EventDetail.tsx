import { useEffect, useState, useRef } from 'react'
import { useParams, Link, Navigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { eventToJsonLd } from '../lib/jsonld'
import { supabase } from '../lib/supabaseClient'
import { trackEventDetailView } from '../lib/analytics'
import { useScrollDepth } from '@/hooks/useScrollDepth'
import EventComments from '@/components/EventComments'
import type { Event, Category, AccessRoute, Accommodation } from '../types/event'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
// ViewLimit はCategoryDetailのみで管理
import {
  Calendar,
  MapPin,
  ArrowLeft,
  ExternalLink,
  FileEdit,
  Home,
  ChevronRight,
  Train,
  Moon,
  Sun,
  ArrowRight,
} from 'lucide-react'
// SaveButton moved to CategoryDetail (#375: カテゴリ単位のお気に入り)

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

/**
 * 大会概要ページ: カテゴリ一覧を表示し、各カテゴリの詳細ページへリンク
 * カテゴリ0件の場合はイベントレベルの情報（アクセス・申込み等）を直接表示 (#32)
 */
function EventDetail() {
  const { eventId, lang } = useParams<{ eventId: string; lang: string }>()
  const location = useLocation()
  const { t } = useTranslation()
  const langPrefix = `/${lang || 'ja'}`
  const isEn = lang === 'en'
  const [event, setEvent] = useState<Event | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [accessRoutes, setAccessRoutes] = useState<AccessRoute[]>([])
  const [accommodations, setAccommodations] = useState<Accommodation[]>([])
  const [relatedEvents, setRelatedEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const trackedRef = useRef(false)
  useScrollDepth('event_detail')

  // GA4: イベント詳細閲覧 + view count increment
  useEffect(() => {
    if (event && !trackedRef.current) {
      trackEventDetailView(event.id, event.name, event.race_type)
      // increment()はCategoryDetailのみで実行（2重カウント防止）
      trackedRef.current = true
    }
  }, [event])

  const raceTypeLabel = (rt: string | null) => {
    if (!rt) return isEn ? 'Other' : 'その他'
    return t(`raceType.${rt}`, rt)
  }

  /** Format interval string (e.g. "03:30:00") to human readable */
  const formatTimeEstimate = (v: string | null): string | null => {
    if (!v) return null
    const hms = v.match(/^(\d+):(\d+):(\d+)/)
    if (hms) {
      const h = parseInt(hms[1], 10)
      const min = parseInt(hms[2], 10)
      if (isEn) {
        const parts = []
        if (h > 0) parts.push(`${h}h`)
        if (min > 0) parts.push(`${min}m`)
        return parts.join('') || v
      }
      const parts = []
      if (h > 0) parts.push(`${h}時間`)
      if (min > 0) parts.push(`${min}分`)
      return parts.join('') || v
    }
    const hourMatch = v.match(/(\d+)\s*hour/)
    const minMatch = v.match(/(\d+)\s*minute/)
    if (hourMatch || minMatch) {
      const parts = []
      if (isEn) {
        if (hourMatch) parts.push(`${parseInt(hourMatch[1], 10)}h`)
        if (minMatch) parts.push(`${parseInt(minMatch[1], 10)}m`)
      } else {
        if (hourMatch) parts.push(`${parseInt(hourMatch[1], 10)}時間`)
        if (minMatch) parts.push(`${parseInt(minMatch[1], 10)}分`)
      }
      return parts.join('')
    }
    return v
  }

  const stayStatusLabel = (s: string | null) => {
    if (!s) return null
    if (isEn) {
      const map: Record<string, string> = {
        day_trip: 'Day trip OK',
        pre_stay_required: 'Overnight needed',
        post_stay_recommended: 'Overnight recommended',
      }
      return map[s] ?? null
    }
    const map: Record<string, string> = {
      day_trip: '日帰りOK',
      pre_stay_required: '前泊必須',
      post_stay_recommended: '後泊推奨',
    }
    return map[s] ?? null
  }

  useEffect(() => {
    if (!eventId) return
    async function fetchData() {
      try {
        const [eventRes, catRes, routesRes, accRes] = await Promise.all([
          supabase.from('events').select('*').eq('id', eventId).maybeSingle(),
          supabase.from('categories').select('*').eq('event_id', eventId).order('name'),
          supabase.from('access_routes').select('*').eq('event_id', eventId).order('direction'),
          supabase.from('accommodations').select('*').eq('event_id', eventId),
        ])

        if (eventRes.error) throw eventRes.error
        setEvent(eventRes.data ?? null)
        setCategories(catRes.data ?? [])
        setAccessRoutes(routesRes.data ?? [])
        setAccommodations(accRes.data ?? [])
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.message
            : e && typeof e === 'object' && 'message' in e
              ? String((e as { message: unknown }).message)
              : String(e)
        console.error('[EventDetail] 取得エラー:', e)
        setError(msg || '取得に失敗しました')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [eventId])

  // Fetch related events (same race_type, limit 3)
  useEffect(() => {
    if (!event?.race_type || !event.id) return
    async function fetchRelated() {
      const { data } = await supabase
        .from('events')
        .select('*')
        .eq('race_type', event!.race_type!)
        .neq('id', event!.id)
        .not('location', 'is', null)
        .order('event_date', { ascending: true })
        .limit(3)
      setRelatedEvents(data ?? [])
    }
    fetchRelated()
  }, [event?.id, event?.race_type])

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-6">
        <Skeleton className="mb-4 h-6 w-32" />
        <Skeleton className="mb-6 h-10 w-3/4" />
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
        <p className="sr-only">{isEn ? 'Loading...' : '読み込み中...'}</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center">
        <p className="text-destructive">{isEn ? 'Error' : 'エラー'}: {error}</p>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center">
        <p className="text-muted-foreground">{isEn ? 'Event not found' : '大会が見つかりません'}</p>
      </div>
    )
  }

  // enrich未完了のイベントは一覧へリダイレクト (#63, #71)
  const hasEnrichedCategories = categories.length === 0 || categories.some(c => c.distance_km != null || c.elevation_gain != null)
  if (event.location == null || !hasEnrichedCategories) return <Navigate to={langPrefix} replace />

  // カテゴリがある場合は最初のカテゴリ詳細へリダイレクト (#384)
  if (categories.length >= 1 && eventId) {
    return <Navigate to={`${langPrefix}/events/${eventId}/categories/${categories[0].id}`} replace />
  }

  const dateDisplay = event.event_date_end && event.event_date_end !== event.event_date
    ? `${event.event_date}〜${event.event_date_end}`
    : event.event_date ?? '—'

  // #8: Prefer _en fields for English pages
  const displayName = isEn ? (event.name_en ?? event.name) : event.name
  const displayLocation = isEn ? (event.location_en ?? event.location) : event.location
  const displayDescription = isEn ? (event.description_en ?? event.description) : event.description

  // GSC CTR improvement: Generate enriched meta description with race details
  const enrichedMetaDescription = (() => {
    const baseDesc = displayDescription
    if (baseDesc) return baseDesc // Use existing description if available

    const parts = []
    if (isEn) {
      parts.push(displayName)
      if (displayLocation) parts.push(displayLocation)
      parts.push('- entry fee, access, accommodation')
      return parts.join(' | ')
    } else {
      // Japanese: More search-friendly format for 「トレイルランニング 日本 レース」等
      const raceTypeStr = event.race_type ? raceTypeLabel(event.race_type) : '大会'
      parts.push(`${displayName} ${event.event_date ? event.event_date.split('-')[0] : ''}`)
      if (displayLocation) parts.push(`(${displayLocation})`)
      parts.push(`${raceTypeStr}の参加費・アクセス・宿泊`)
      return parts.join('')
    }
  })()

  // Value badges data
  const tokyoOutbound = accessRoutes.find(
    (r) => r.origin_type === 'tokyo' && r.direction === 'outbound'
  )
  const travelTime = formatTimeEstimate(tokyoOutbound?.total_time_estimate ?? null)
  const stayLabel = stayStatusLabel(event.stay_status ?? null)
  const isDayTrip = event.stay_status === 'day_trip'

  // カテゴリ0件: イベントレベルの情報を直接表示 (#32)
  if (categories.length === 0) {
    return (
      <>
        <title>{displayName} | yabai.travel</title>
        <meta name="description" content={enrichedMetaDescription} />
        <meta property="og:title" content={`${displayName} | yabai.travel`} />
        <meta property="og:description" content={enrichedMetaDescription} />
        <meta property="og:url" content={`https://yabai.travel${location.pathname}`} />
        <link rel="canonical" href={`https://yabai.travel${location.pathname}`} />
        <link rel="alternate" hrefLang="ja" href={`https://yabai.travel/ja/events/${event.id}`} />
        <link rel="alternate" hrefLang="en" href={`https://yabai.travel/en/events/${event.id}`} />
        <link rel="alternate" hrefLang="x-default" href={`https://yabai.travel/en/events/${event.id}`} />
        <script type="application/ld+json">{JSON.stringify(eventToJsonLd(event, categories, isEn))}</script>
        <div className="mx-auto max-w-4xl px-4 py-6 md:px-6">
          {/* Breadcrumb */}
          <div className="mb-6">
            <Link
              to={langPrefix}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('detail.backToList')}
            </Link>
          </div>

          {/* Service tagline */}
          <p className="mb-4 text-xs text-muted-foreground/70">
            {isEn
              ? 'Find endurance races in Japan \u2014 access, accommodation, costs all in one place'
              : '日本のエンデュランスレースを探して、旅行計画まで。'}
          </p>

          {/* Hero */}
          <div className="mb-8">
            <div className="flex items-start justify-between gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                {displayName}
              </h1>
            </div>
            {displayDescription && (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {displayDescription}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                {dateDisplay}
              </span>
              {displayLocation && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                  {displayLocation}
                </span>
              )}
            </div>

            {/* Value badges */}
            {(travelTime || stayLabel) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {travelTime && (
                  <Badge variant="outline" className="border border-sky-200 bg-sky-50 text-xs text-sky-700">
                    <Train className="mr-1 h-3 w-3" />
                    {isEn ? `Tokyo Station \u2192 ${travelTime}` : `東京駅 \u2192 ${travelTime}`}
                  </Badge>
                )}
                {stayLabel && (
                  <Badge
                    variant="outline"
                    className={cn(
                      'border text-xs',
                      isDayTrip
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-amber-200 bg-amber-50 text-amber-700'
                    )}
                  >
                    {isDayTrip ? <Sun className="mr-1 h-3 w-3" /> : <Moon className="mr-1 h-3 w-3" />}
                    {stayLabel}
                  </Badge>
                )}
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {event.race_type && (
                <Badge
                  variant="outline"
                  className={cn('border text-xs', raceTypeColors[event.race_type ?? 'other'])}
                >
                  {raceTypeLabel(event.race_type)}
                </Badge>
              )}
            </div>
            {(event.official_url || event.entry_url) && (
              <div className="mt-3 flex gap-3">
                {event.official_url && (
                  <Button asChild variant="outline" size="sm">
                    <a href={event.official_url} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      {isEn ? 'Official' : '公式'}
                    </a>
                  </Button>
                )}
                {event.entry_url && (
                  <Button asChild variant="outline" size="sm">
                    <a href={event.entry_url} target="_blank" rel="noreferrer">
                      <FileEdit className="mr-1.5 h-3.5 w-3.5" />
                      {isEn ? 'Entry' : '申込'}
                    </a>
                  </Button>
                )}
              </div>
            )}
          </div>

          <>
          {/* 申込み */}
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-base">{isEn ? 'Entry' : '申込み'}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[minmax(120px,1fr)_minmax(180px,2fr)] gap-x-6 gap-y-3 text-sm">
                <dt className="text-muted-foreground">{isEn ? 'Entry method?' : 'エントリ方法は？'}</dt>
                <dd className={event.entry_type ? '' : 'italic text-muted-foreground/60'}>
                  {event.entry_type === 'lottery' ? (isEn ? 'Lottery' : '抽選') : event.entry_type === 'first_come' ? (isEn ? 'First come, first served' : '先着') : event.entry_type ?? '—'}
                </dd>
                <dt className="text-muted-foreground">{isEn ? 'Qualification required?' : '参加資格はある？'}</dt>
                <dd className={event.required_qualification ? '' : 'italic text-muted-foreground/60'}>
                  {(isEn ? (event.required_qualification_en ?? event.required_qualification) : event.required_qualification) ?? '—'}
                </dd>
                <dt className="text-muted-foreground">{isEn ? 'Entry opens?' : 'いつから申し込める？'}</dt>
                <dd className={event.entry_start ? '' : 'italic text-muted-foreground/60'}>{event.entry_start ?? '—'}</dd>
                <dt className="text-muted-foreground">{isEn ? 'Entry deadline?' : '申込み締切はいつ？'}</dt>
                <dd className={event.entry_end ? '' : 'italic text-muted-foreground/60'}>{event.entry_end ?? '—'}</dd>
              </dl>
            </CardContent>
          </Card>

          {/* 宿泊 */}
          <Card className="mb-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Home className="h-4 w-4 text-primary" />
                  {isEn ? 'Accommodation' : '宿泊'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-[minmax(120px,1fr)_minmax(180px,2fr)] gap-x-6 gap-y-3 text-sm">
                  <dt className="text-muted-foreground">{isEn ? 'Where to stay?' : 'どこに泊まればいい？'}</dt>
                  <dd className={accommodations.some((a) => a.recommended_area) ? '' : 'italic text-muted-foreground/60'}>
                    {accommodations.map((a) => isEn ? (a.recommended_area_en ?? a.recommended_area) : a.recommended_area).filter(Boolean).join('、') || '—'}
                  </dd>
                  <dt className="text-muted-foreground">{isEn ? 'Accommodation cost estimate?' : '宿泊費の目安は？'}</dt>
                  <dd className={accommodations.some((a) => a.avg_cost_3star != null) ? '' : 'italic text-muted-foreground/60'}>
                    {accommodations.find((a) => a.avg_cost_3star != null)?.avg_cost_3star != null
                      ? (isEn
                        ? `Approx. ${accommodations.find((a) => a.avg_cost_3star != null)?.avg_cost_3star?.toLocaleString()} JPY`
                        : `約${accommodations.find((a) => a.avg_cost_3star != null)?.avg_cost_3star?.toLocaleString()}円`)
                      : '—'}
                  </dd>
                </dl>
              </CardContent>
          </Card>

          {/* レースレポート・口コミ */}
          <EventComments eventId={event.id} raceType={event.race_type ?? undefined} isEn={isEn} />

          {/* Related races */}
          {relatedEvents.length > 0 && (
            <Card className="mb-4 mt-6">
              <CardHeader>
                <CardTitle className="text-base">
                  {isEn ? 'Related races' : '関連レース'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {relatedEvents.map((re) => {
                    const reName = isEn ? (re.name_en ?? re.name) : re.name
                    const reLoc = isEn ? (re.location_en ?? re.location) : re.location
                    return (
                      <Link
                        key={re.id}
                        to={`${langPrefix}/events/${re.id}`}
                        className="flex items-center justify-between rounded-lg border border-border/60 p-3 no-underline transition-colors hover:border-primary/40 hover:bg-primary/5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">{reName}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            {re.event_date && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {re.event_date}
                              </span>
                            )}
                            {reLoc && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {reLoc}
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </Link>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* CTA to event list */}
          <div className="mt-6 text-center">
            <Button asChild variant="outline" size="sm">
              <Link to={`${langPrefix}/events`}>
                {isEn ? 'Browse more races from Tokyo' : '東京発のレースをもっと探す'}
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>

          {/* 最終更新 */}
          {event.updated_at && (
            <p className="mt-6 border-t border-border pt-4 text-right text-xs text-muted-foreground/70">
              {isEn ? 'Last updated' : '最終更新'}: <time dateTime={event.updated_at}>{event.updated_at.slice(0, 10)}</time>
            </p>
          )}
          </>
        </div>
      </>
    )
  }

  // カテゴリ2件以上: カテゴリ選択画面
  return (
    <>
      <title>{displayName} | yabai.travel</title>
      <meta name="description" content={enrichedMetaDescription} />
      <meta property="og:title" content={`${displayName} | yabai.travel`} />
      <meta property="og:description" content={enrichedMetaDescription} />
      <meta property="og:url" content={`https://yabai.travel${location.pathname}`} />
      <link rel="canonical" href={`https://yabai.travel${location.pathname}`} />
      <link rel="alternate" hrefLang="ja" href={`https://yabai.travel/ja/events/${event.id}`} />
      <link rel="alternate" hrefLang="en" href={`https://yabai.travel/en/events/${event.id}`} />
      <link rel="alternate" hrefLang="x-default" href={`https://yabai.travel/en/events/${event.id}`} />
      <script type="application/ld+json">{JSON.stringify(eventToJsonLd(event, categories, isEn))}</script>
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-6">
        {/* Breadcrumb */}
        <div className="mb-6">
          <Link
            to={langPrefix}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('detail.backToList')}
          </Link>
        </div>

        {/* Hero */}
        <div className="mb-8">
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              {displayName}
            </h1>
          </div>
          {displayDescription && (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {displayDescription}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 shrink-0 text-primary/70" />
              {event.event_date}
            </span>
            {displayLocation && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                {displayLocation}
              </span>
            )}
          </div>
        </div>

        <>
        {/* カテゴリ選択 */}
        <div className="space-y-3">
          <div className="mb-2">
            <h2 className="text-lg font-semibold text-foreground">
              {isEn ? 'Select a category' : 'カテゴリを選ぶ'}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {isEn ? 'Click on a category to see details' : '調べたいカテゴリをクリックしてください'}
            </p>
          </div>
          {categories.map((cat) => (
            <Card
              key={cat.id}
              className="group overflow-hidden border-border/60 py-0 transition-all duration-200 hover:border-primary/40 hover:shadow-md"
            >
              <CardContent className="p-0">
                <Link
                  to={`${langPrefix}/events/${eventId}/categories/${cat.id}`}
                  className="flex items-center justify-between gap-4 p-4 no-underline"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-base font-semibold text-foreground transition-colors group-hover:text-primary">
                      {isEn ? (cat.name_en ?? cat.name) : cat.name}
                    </span>
                    {(cat.distance_km != null || cat.elevation_gain != null) && (
                      <span className="ml-3 text-sm text-muted-foreground">
                        {cat.distance_km != null && `${cat.distance_km}km`}
                        {cat.distance_km != null && cat.elevation_gain != null && ' / '}
                        {cat.elevation_gain != null && `D+${cat.elevation_gain}m`}
                      </span>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Crew CTA */}
        {!isEn && (
          <div className="my-8 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <p className="font-semibold text-foreground">
                  {'お気に入りに保存して後で確認'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {'Crewメンバー機能'}
                </p>
              </div>
              <Button asChild size="sm">
                <Link to={`${langPrefix}/pricing`}>
                  {'詳しく'}
                </Link>
              </Button>
            </div>
          </div>
        )}

        {/* レースレポート・口コミ */}
        <EventComments eventId={event.id} raceType={event.race_type ?? undefined} isEn={isEn} />

        {/* 最終更新 */}
        {event.updated_at && (
          <p className="mt-6 border-t border-border pt-4 text-right text-xs text-muted-foreground/70">
            {isEn ? 'Last updated' : '最終更新'}: <time dateTime={event.updated_at}>{event.updated_at.slice(0, 10)}</time>
          </p>
        )}
        </>
      </div>
    </>
  )
}

export default EventDetail
