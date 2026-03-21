import { useEffect, useState } from 'react'
import { useParams, Link, Navigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { eventToJsonLd } from '../lib/jsonld'
import { supabase } from '../lib/supabaseClient'
import type { Event, Category, AccessRoute, Accommodation } from '../types/event'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  Calendar,
  MapPin,
  ArrowLeft,
  ExternalLink,
  FileEdit,
  Train,
  Home,
  ChevronRight,
} from 'lucide-react'

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const raceTypeLabel = (rt: string | null) => {
    if (!rt) return isEn ? 'Other' : 'その他'
    return t(`raceType.${rt}`, rt)
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

  // カテゴリが1つのみの場合はその詳細へリダイレクト
  if (categories.length === 1 && eventId) {
    return <Navigate to={`${langPrefix}/events/${eventId}/categories/${categories[0].id}`} replace />
  }

  const outbound = accessRoutes.find((r) => r.direction === 'outbound')
  const returnRoute = accessRoutes.find((r) => r.direction === 'return')

  const dateDisplay = event.event_date_end && event.event_date_end !== event.event_date
    ? `${event.event_date}〜${event.event_date_end}`
    : event.event_date ?? '—'

  // #8: Prefer _en fields for English pages
  const displayName = isEn ? (event.name_en ?? event.name) : event.name
  const displayLocation = isEn ? (event.location_en ?? event.location) : event.location
  const displayDescription = isEn ? (event.description_en ?? event.description) : event.description

  // カテゴリ0件: イベントレベルの情報を直接表示 (#32)
  if (categories.length === 0) {
    return (
      <>
        <title>{displayName} | yabai.travel</title>
        <meta name="description" content={displayDescription ?? `${displayName}の大会情報・アクセス・宿泊をまとめてチェック。`} />
        <meta property="og:title" content={`${displayName} | yabai.travel`} />
        <meta property="og:description" content={displayDescription ?? `${displayName}の大会情報・アクセス・宿泊をまとめてチェック。`} />
        <meta property="og:url" content={`https://yabai-travel.vercel.app/ja/events/${event.id}`} />
        <link rel="canonical" href={`https://yabai-travel.vercel.app${location.pathname}`} />
        <link rel="alternate" hrefLang="ja" href={`https://yabai-travel.vercel.app${location.pathname}`} />
        <link rel="alternate" hrefLang="en" href={`https://yabai-travel.vercel.app${location.pathname}?lang=en`} />
        <link rel="alternate" hrefLang="x-default" href={`https://yabai-travel.vercel.app${location.pathname}`} />
        <script type="application/ld+json">{JSON.stringify(eventToJsonLd(event, categories))}</script>
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
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              {displayName}
            </h1>
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

          {/* アクセス */}
          {(outbound || returnRoute) && (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Train className="h-4 w-4 text-primary" />
                  {isEn ? 'Public transit access' : '公共交通機関で行けるか'}
                </CardTitle>
              </CardHeader>
              <CardContent>
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
                    <span className={outbound?.total_time_estimate ? '' : 'italic text-muted-foreground/60'}>{outbound?.total_time_estimate ?? '—'}</span>
                    {outbound?.cost_estimate && <span className="font-medium text-primary">{outbound.cost_estimate}</span>}
                  </div>
                  <div className="flex items-baseline gap-2 text-sm">
                    <span className="min-w-[2.5em] font-semibold text-muted-foreground">{isEn ? 'From' : '復路'}</span>
                    <span className={returnRoute?.total_time_estimate ? '' : 'italic text-muted-foreground/60'}>{returnRoute?.total_time_estimate ?? '—'}</span>
                    {returnRoute?.cost_estimate && <span className="font-medium text-primary">{returnRoute.cost_estimate}</span>}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 宿泊 */}
          {accommodations.length > 0 && (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Home className="h-4 w-4 text-primary" />
                  {isEn ? 'How many days needed?' : '何日必要か'}
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
          )}

          {/* レースレポート・口コミ */}

          {/* 最終更新 */}
          {event.updated_at && (
            <p className="mt-6 border-t border-border pt-4 text-right text-xs text-muted-foreground/70">
              {isEn ? 'Last updated' : '最終更新'}: <time dateTime={event.updated_at}>{event.updated_at.slice(0, 10)}</time>
            </p>
          )}
        </div>
      </>
    )
  }

  // カテゴリ2件以上: カテゴリ選択画面
  return (
    <>
      <title>{displayName} | yabai.travel</title>
      <meta name="description" content={displayDescription ?? `${displayName}の大会情報・アクセス・宿泊をまとめてチェック。`} />
      <meta property="og:title" content={`${displayName} | yabai.travel`} />
      <meta property="og:description" content={displayDescription ?? `${displayName}の大会情報・アクセス・宿泊をまとめてチェック。`} />
      <meta property="og:url" content={`https://yabai-travel.vercel.app/ja/events/${event.id}`} />
      <link rel="canonical" href={`https://yabai-travel.vercel.app${location.pathname}`} />
      <link rel="alternate" hrefLang="ja" href={`https://yabai-travel.vercel.app${location.pathname}`} />
      <link rel="alternate" hrefLang="en" href={`https://yabai-travel.vercel.app${location.pathname}?lang=en`} />
      <link rel="alternate" hrefLang="x-default" href={`https://yabai-travel.vercel.app${location.pathname}`} />
      <script type="application/ld+json">{JSON.stringify(eventToJsonLd(event, categories))}</script>
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
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            {displayName}
          </h1>
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

        {/* レースレポート・口コミ */}

        {/* 最終更新 */}
        {event.updated_at && (
          <p className="mt-6 border-t border-border pt-4 text-right text-xs text-muted-foreground/70">
            {isEn ? 'Last updated' : '最終更新'}: <time dateTime={event.updated_at}>{event.updated_at.slice(0, 10)}</time>
          </p>
        )}
      </div>
    </>
  )
}

export default EventDetail
