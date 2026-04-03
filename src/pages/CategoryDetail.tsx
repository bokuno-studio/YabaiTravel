import { useEffect, useState, useRef } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { categoryToJsonLd } from '../lib/jsonld'
import { supabase } from '../lib/supabaseClient'
import { trackEventDetailView } from '../lib/analytics'
import { useScrollDepth } from '@/hooks/useScrollDepth'
import type { Event, AccessRoute, Accommodation, Category, CourseMapFile, StayStatus } from '../types/event'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useViewLimit } from '@/hooks/useViewLimit'
import { useAuth } from '@/lib/auth'
import { useFavorites } from '@/hooks/useFavorites'
import ViewLimitBadge from '@/components/ViewLimitBadge'
import ViewLimitWall from '@/components/ViewLimitWall'
import SaveButton from '@/components/SaveButton'
import EventComments from '@/components/EventComments'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ExternalLink,
  FileEdit,
  Calendar,
  MapPin,
  Users,
  ChevronRight,
  Train,
  Sun,
  Moon,
  ArrowRight,
} from 'lucide-react'

import RaceSpecs from '@/components/category/RaceSpecs'
import AccessInfo from '@/components/category/AccessInfo'
import AccommodationInfo from '@/components/category/AccommodationInfo'
import CostBreakdown from '@/components/category/CostBreakdown'
import CourseMap from '@/components/category/CourseMap'
import EventMap from '@/components/category/EventMap'
import PastEditions from '@/components/category/PastEditions'
import SectionCard from '@/components/category/SectionCard'
import DLRow from '@/components/category/DLRow'

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

/** Parse PostgreSQL text[] format {"item1","item2"} into a readable newline-separated string.
 *  Handles quoted items that may contain commas, e.g. {"a, b","c"} → "a, b\nc"
 */
function formatPostgresArray(val: string | string[] | null | undefined): string | null | undefined {
  if (val == null) return val
  if (Array.isArray(val)) return val.join('\n')
  const s = String(val)
  if (s.startsWith('{') && s.endsWith('}')) {
    const inner = s.slice(1, -1)
    if (!inner) return s
    const items: string[] = []
    let i = 0
    while (i < inner.length) {
      if (inner[i] === '"') {
        i++
        let item = ''
        while (i < inner.length) {
          if (inner[i] === '\\' && i + 1 < inner.length) {
            item += inner[i + 1]
            i += 2
          } else if (inner[i] === '"') {
            i++
            break
          } else {
            item += inner[i]
            i++
          }
        }
        items.push(item.trim())
        if (i < inner.length && inner[i] === ',') i++
      } else {
        const commaIdx = inner.indexOf(',', i)
        const item = commaIdx === -1 ? inner.slice(i) : inner.slice(i, commaIdx)
        items.push(item.trim())
        i = commaIdx === -1 ? inner.length : commaIdx + 1
      }
    }
    return items.filter(Boolean).join('\n')
  }
  return s
}

function CategoryDetail() {
  const { eventId, categoryId, lang } = useParams<{ eventId: string; categoryId: string; lang: string }>()
  const location = useLocation()
  const { t } = useTranslation()
  const langPrefix = `/${lang || 'ja'}`
  const isEn = lang === 'en'
  const [event, setEvent] = useState<Event | null>(null)
  const [category, setCategory] = useState<Category | null>(null)
  const [accessRoutes, setAccessRoutes] = useState<AccessRoute[]>([])
  const [accommodations, setAccommodations] = useState<Accommodation[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [courseMapFiles, setCourseMapFiles] = useState<CourseMapFile[]>([])
  const [pastEditions, setPastEditions] = useState<Array<{ event: Event; courseMaps: CourseMapFile[]; categories: Category[] }>>([])
  const [relatedEvents, setRelatedEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { isFavorite, toggle: toggleFavorite } = useFavorites()
  const { user, signInWithGoogle } = useAuth()
  useScrollDepth('event_detail')
  const trackedEventRef = useRef<string | null>(null)
  const { remaining, isLimited, increment, isSupporter, viewLimit } = useViewLimit()

  // GA4: イベント詳細閲覧 + view count increment（同一イベント内のカテゴリ切り替えではカウントしない）
  useEffect(() => {
    if (event && trackedEventRef.current !== event.id) {
      trackEventDetailView(event.id, event.name, event.race_type)
      increment()
      trackedEventRef.current = event.id
    }
  }, [event])

  useEffect(() => {
    if (!eventId || !categoryId) return
    async function fetchData() {
      try {
        const [eventRes, catRes, routesRes, accRes, allCatsRes, courseMapsRes] = await Promise.all([
          supabase.from('events').select('*').eq('id', eventId).maybeSingle(),
          supabase.from('categories').select('*').eq('id', categoryId).eq('event_id', eventId).maybeSingle(),
          supabase.from('access_routes').select('*').eq('event_id', eventId).order('direction'),
          supabase.from('accommodations').select('*').eq('event_id', eventId),
          supabase.from('categories').select('*').eq('event_id', eventId).order('name'),
          supabase.from('course_map_files').select('*').eq('event_id', eventId).order('year', { ascending: false }),
        ])

        if (eventRes.error) throw eventRes.error
        if (catRes.error) throw catRes.error
        const ev = eventRes.data ?? null
        setEvent(ev)
        setCategory(catRes.data ?? null)
        setAccessRoutes(routesRes.data ?? [])
        setAccommodations(accRes.data ?? [])
        setCategories(allCatsRes.data ?? [])
        setCourseMapFiles(courseMapsRes.data ?? [])

        // 同一シリーズの過去開催を取得（去年のコースマップ・料金・申込日参照用）
        if (ev?.event_series_id) {
          const pastRes = await supabase
            .from('events')
            .select('*')
            .eq('event_series_id', ev.event_series_id)
            .lt('event_date', ev.event_date)
            .order('event_date', { ascending: false })
            .limit(5)
          const pastEvents = pastRes.data ?? []
          const pastWithMaps: Array<{ event: Event; courseMaps: CourseMapFile[]; categories: Category[] }> = []
          for (const pe of pastEvents) {
            const [mapsRes, catsRes] = await Promise.all([
              supabase.from('course_map_files').select('*').eq('event_id', pe.id).order('year', { ascending: false }),
              supabase.from('categories').select('*').eq('event_id', pe.id).order('name'),
            ])
            pastWithMaps.push({
              event: pe as Event,
              courseMaps: mapsRes.data ?? [],
              categories: catsRes.data ?? [],
            })
          }
          setPastEditions(pastWithMaps)
        }
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.message
            : e && typeof e === 'object' && 'message' in e
              ? String((e as { message: unknown }).message)
              : String(e)
        console.error('[CategoryDetail] 取得エラー:', e)
        setError(msg || '取得に失敗しました')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [eventId, categoryId])

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

  const stayStatusLabel = (s: StayStatus | null) => {
    if (!s) return null
    if (isEn) {
      const map: Record<StayStatus, string> = {
        day_trip: 'Day trip possible',
        pre_stay_required: 'Pre-night stay required',
        post_stay_recommended: 'Post-night stay recommended',
      }
      return map[s]
    }
    const map: Record<StayStatus, string> = {
      day_trip: '日帰り可能',
      pre_stay_required: '前泊必須',
      post_stay_recommended: '後泊推奨',
    }
    return map[s]
  }

  const stayStatusColors: Record<StayStatus, string> = {
    day_trip: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    pre_stay_required: 'bg-orange-50 text-orange-700 border-orange-200',
    post_stay_recommended: 'bg-violet-50 text-violet-700 border-violet-200',
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

  const raceTypeLabel = (rt: string | null) => {
    if (!rt) return isEn ? 'Other' : 'その他'
    return t(`raceType.${rt}`, rt)
  }

  const formatInterval = (v: string | null) => {
    if (!v) return null
    const hms = v.match(/^(\d+):(\d+):(\d+)/)
    if (hms) {
      const h = parseInt(hms[1], 10)
      const min = parseInt(hms[2], 10)
      const sec = parseInt(hms[3], 10)
      const parts = []
      if (isEn) {
        if (h > 0) parts.push(`${h}h`)
        if (min > 0) parts.push(`${min}m`)
        if (sec > 0 && h === 0 && min === 0) parts.push(`${sec}s`)
      } else {
        if (h > 0) parts.push(`${h}時間`)
        if (min > 0) parts.push(`${min}分`)
        if (sec > 0 && h === 0 && min === 0) parts.push(`${sec}秒`)
      }
      return parts.length ? parts.join('') : v
    }
    const dayMatch = v.match(/(\d+)\s*day/)
    const hourMatch = v.match(/(\d+)\s*hour/)
    const minMatch = v.match(/(\d+)\s*minute/)
    if (dayMatch || hourMatch || minMatch) {
      const parts = []
      if (isEn) {
        if (dayMatch) parts.push(`${parseInt(dayMatch[1], 10)}d`)
        if (hourMatch) parts.push(`${parseInt(hourMatch[1], 10)}h`)
        if (minMatch) parts.push(`${parseInt(minMatch[1], 10)}m`)
      } else {
        if (dayMatch) parts.push(`${parseInt(dayMatch[1], 10)}日`)
        if (hourMatch) parts.push(`${parseInt(hourMatch[1], 10)}時間`)
        if (minMatch) parts.push(`${parseInt(minMatch[1], 10)}分`)
      }
      return parts.join('')
    }
    return v
  }

  /** 日付を 2024/11/5 形式で表示 */
  const formatDate = (d: string | null) => {
    if (!d) return null
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) return `${m[1]}/${parseInt(m[2], 10)}/${parseInt(m[3], 10)}`
    return d
  }

  const formatCutoffTimes = (cutoff: unknown): string | null => {
    if (!cutoff || !Array.isArray(cutoff)) return null
    const items = cutoff
      .filter((x): x is { point?: string; time?: string } => x != null && typeof x === 'object')
      .map((x) => {
        const p = x.point ?? '—'
        const t = x.time ?? '—'
        return `${p}: ${t}`
      })
    return items.length > 0 ? items.join('\n') : null
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-6">
        <Skeleton className="mb-4 h-6 w-48" />
        <Skeleton className="mb-2 h-10 w-3/4" />
        <Skeleton className="mb-6 h-5 w-1/2" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
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

  if (!event || !category) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center">
        <p className="text-muted-foreground">{isEn ? 'Not found' : '見つかりません'}</p>
      </div>
    )
  }

  // #325: isEn の場合は venue_access ルートを優先表示、なければ tokyo にフォールバック
  const venueAccessRoute = accessRoutes.find((r) => r.origin_type === 'venue_access')
  const tokyoOutbound = accessRoutes.find((r) => r.direction === 'outbound' && r.origin_type !== 'venue_access')
  const tokyoReturn = accessRoutes.find((r) => r.direction === 'return' && r.origin_type !== 'venue_access')
  const outbound = isEn && venueAccessRoute ? venueAccessRoute : tokyoOutbound
  const returnRoute = isEn && venueAccessRoute ? undefined : tokyoReturn
  const sameStartGoal = isEn && venueAccessRoute ? true : (!tokyoReturn || (tokyoOutbound?.route_detail === tokyoReturn?.route_detail))
  const stayStatus = category.stay_status ?? event.stay_status
  const travelTime = formatTimeEstimate(tokyoOutbound?.total_time_estimate ?? null)
  const isDayTrip = stayStatus === 'day_trip'

  const dateDisplay = event.event_date_end && event.event_date_end !== event.event_date
    ? `${event.event_date}〜${event.event_date_end}`
    : event.event_date

  // #8: Prefer _en fields for English pages
  const displayName = isEn ? (event.name_en ?? event.name) : event.name
  const displayCategoryName = isEn ? (category.name_en ?? category.name) : category.name
  const displayLocation = isEn ? (event.location_en ?? event.location) : event.location
  const displayReceptionPlace = isEn
    ? (category.reception_place_en ?? category.reception_place ?? event.reception_place_en ?? event.reception_place)
    : (category.reception_place ?? event.reception_place)
  const displayStartPlace = isEn
    ? (category.start_place_en ?? category.start_place ?? event.start_place_en ?? event.start_place)
    : (category.start_place ?? event.start_place)
  const displayMandatoryGear = formatPostgresArray(isEn ? (category.mandatory_gear_en ?? category.mandatory_gear) : category.mandatory_gear)
  const displayRecommendedGear = formatPostgresArray(isEn ? (category.recommended_gear_en ?? category.recommended_gear) : category.recommended_gear)
  const displayProhibitedItems = formatPostgresArray(isEn ? (category.prohibited_items_en ?? category.prohibited_items) : category.prohibited_items)
  const displayRequiredPace = isEn ? (category.required_pace_en ?? category.required_pace) : category.required_pace
  const displayRequiredClimbPace = isEn ? (category.required_climb_pace_en ?? category.required_climb_pace) : category.required_climb_pace
  const displayRequiredQualification = isEn ? (event.required_qualification_en ?? event.required_qualification) : event.required_qualification
  const displayOutboundRoute = isEn ? (outbound?.route_detail_en ?? outbound?.route_detail) : outbound?.route_detail
  const displayReturnRoute = isEn ? (returnRoute?.route_detail_en ?? returnRoute?.route_detail) : returnRoute?.route_detail
  // シャトル情報は常にtokyo routeから取得（venue_accessには入らないため）
  const displayOutboundShuttle = isEn
    ? (tokyoOutbound?.shuttle_available_en ?? tokyoOutbound?.shuttle_available)
    : tokyoOutbound?.shuttle_available
  const displayWeatherForecast = isEn ? (event.weather_forecast_en ?? event.weather_forecast) : event.weather_forecast
  const displayRecoveryFacilities = isEn ? (event.recovery_facilities_en ?? event.recovery_facilities) : event.recovery_facilities
  const displayPhotoSpots = isEn ? (event.photo_spots_en ?? event.photo_spots) : event.photo_spots
  const displayVisaInfo = isEn ? (event.visa_info_en ?? event.visa_info) : event.visa_info
  const displayEventProhibitedItems = formatPostgresArray(isEn ? (event.prohibited_items_en ?? event.prohibited_items) : event.prohibited_items)

  return (
    <>
      <title>{displayName} {displayCategoryName} | yabai.travel</title>
      <meta name="description" content={`${displayName} ${displayCategoryName}${isEn ? ' - entry fee, access, accommodation, mandatory gear' : 'コースの参加費・アクセス・宿泊・必携品をまとめてチェック。'}`} />
      <meta property="og:title" content={`${displayName} ${displayCategoryName} | yabai.travel`} />
      <meta property="og:description" content={`${displayName} ${displayCategoryName}${isEn ? ' - entry fee, access, accommodation, mandatory gear' : 'コースの参加費・アクセス・宿泊・必携品をまとめてチェック。'}`} />
      <meta property="og:url" content={`https://yabai.travel${location.pathname}`} />
      <link rel="canonical" href={`https://yabai.travel${location.pathname}`} />
      <link rel="alternate" hrefLang="ja" href={`https://yabai.travel/ja/events/${event.id}/categories/${category.id}`} />
      <link rel="alternate" hrefLang="en" href={`https://yabai.travel/en/events/${event.id}/categories/${category.id}`} />
      <link rel="alternate" hrefLang="x-default" href={`https://yabai.travel/en/events/${event.id}/categories/${category.id}`} />
      <script type="application/ld+json">{JSON.stringify(categoryToJsonLd(event, category, isEn))}</script>
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-6">
        {/* Breadcrumb */}
        <div className="mb-6 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <Link
            to={langPrefix}
            className="transition-colors hover:text-primary"
          >
            {isEn ? 'List' : '一覧'}
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link
            to={`${langPrefix}/events/${eventId}`}
            className="transition-colors hover:text-primary"
          >
            {displayName}
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground">{displayCategoryName}</span>
        </div>

        {/* Service tagline */}
        <p className="mb-4 text-xs text-muted-foreground/70">
          {isEn
            ? 'Find endurance races in Japan \u2014 access, accommodation, costs all in one place'
            : '日本のエンデュランスレースを探して、旅行計画まで。'}
        </p>

        {/* Hero */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            {displayName} — {displayCategoryName}
          </h1>
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
            {event.participant_count != null && (
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                {isEn ? `Approx. ${event.participant_count.toLocaleString()}` : `約${event.participant_count.toLocaleString()}人`}
              </span>
            )}
          </div>

          {/* Value badges */}
          <div className="mt-3 flex flex-wrap gap-2">
            {travelTime && (
              <Badge variant="outline" className="border border-sky-200 bg-sky-50 text-xs text-sky-700">
                <Train className="mr-1 h-3 w-3" />
                {isEn ? `Tokyo Station \u2192 ${travelTime}` : `東京駅 \u2192 ${travelTime}`}
              </Badge>
            )}
            {stayStatus && (
              <Badge
                variant="outline"
                className={cn(
                  'border text-xs',
                  isDayTrip
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : stayStatusColors[stayStatus]
                )}
              >
                {isDayTrip ? <Sun className="mr-1 h-3 w-3" /> : <Moon className="mr-1 h-3 w-3" />}
                {stayStatusLabel(stayStatus)}
              </Badge>
            )}
            {event.race_type && (
              <Badge
                variant="outline"
                className={cn('border text-xs', raceTypeColors[event.race_type ?? 'other'])}
              >
                {raceTypeLabel(event.race_type)}
              </Badge>
            )}
          </div>

          {/* Save + View limit */}
          <div className="mt-3 flex items-center gap-3">
            {categoryId && <SaveButton categoryId={categoryId} isFavorite={isFavorite(categoryId)} onToggle={toggleFavorite} isEn={isEn} />}
            {!isSupporter && <ViewLimitBadge remaining={remaining} isEn={isEn} viewLimit={viewLimit} />}
          </div>

          {/* External links */}
          {(event.official_url || event.entry_url) && (
            <div className="mt-3 flex gap-3">
              {event.official_url && (
                <Button asChild variant="default" size="sm" className="min-h-[44px]">
                  <a href={event.official_url} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    {isEn ? 'Visit Official Site' : '公式サイトを見る'}
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

        {isLimited && !isSupporter ? (
          <ViewLimitWall isEn={isEn} langPrefix={langPrefix} user={user} isSupporter={isSupporter} signInWithGoogle={signInWithGoogle} />
        ) : (
        <>
        {/* カテゴリナビ */}
        {categories.length > 1 && (
          <div className="mb-6 flex flex-wrap gap-2">
            {categories.map((c) => (
              <Link
                key={c.id}
                to={`${langPrefix}/events/${eventId}/categories/${c.id}`}
                className={cn(
                  'inline-flex items-center rounded-lg border px-3 py-1.5 text-sm no-underline transition-colors',
                  c.id === categoryId
                    ? 'border-primary/40 bg-primary/10 font-medium text-primary'
                    : 'border-border/60 bg-secondary/50 text-secondary-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-primary',
                )}
              >
                {isEn ? (c.name_en ?? c.name) : c.name}
              </Link>
            ))}
          </div>
        )}

        {/* レーススペック */}
        <RaceSpecs
          eventId={event.id}
          category={category}
          isEn={isEn}
          formatInterval={formatInterval}
          formatCutoffTimes={formatCutoffTimes}
          displayReceptionPlace={displayReceptionPlace}
          displayStartPlace={displayStartPlace}
          displayMandatoryGear={displayMandatoryGear}
          displayRecommendedGear={displayRecommendedGear}
          displayProhibitedItems={displayProhibitedItems}
          displayRequiredPace={displayRequiredPace}
          displayRequiredClimbPace={displayRequiredClimbPace}
        />

        {/* 申込み */}
        <SectionCard title={isEn ? 'Entry' : '申込み'} icon={<FileEdit className="h-4 w-4 text-primary" />}>
          <dl className="grid grid-cols-[minmax(120px,1fr)_minmax(180px,2fr)] gap-x-6 gap-y-3 text-sm">
            <DLRow
              label={isEn ? 'Entry method?' : 'エントリ方法は？'}
              value={event.entry_type === 'lottery' ? (isEn ? 'Lottery' : '抽選') : event.entry_type === 'first_come' ? (isEn ? 'First come, first served' : '先着') : event.entry_type}
            />
            <DLRow label={isEn ? 'Qualification required?' : '参加資格はある？'} value={displayRequiredQualification} />
            <DLRow label={isEn ? 'ITRA points?' : 'ITRAポイントは？'} value={category.itra_points} />
            <DLRow label={isEn ? 'Entry opens?' : 'いつから申し込める？'} value={event.entry_start} />
            <DLRow label={isEn ? 'Entry deadline?' : '申込み締切はいつ？'} value={event.entry_end} />
            <dt className="text-muted-foreground">{isEn ? 'Typical entry period?' : '例年の申込時期は？'}</dt>
            <dd className={event.entry_start_typical ? '' : 'italic text-muted-foreground/60'}>
              {event.entry_start_typical && event.entry_end_typical ? (
                <>
                  {formatDate(event.entry_start_typical)}〜{formatDate(event.entry_end_typical)}
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {isEn ? '(reference for this year\'s entry period)' : '（今年の申込開始の目安）'}
                  </span>
                </>
              ) : (
                '—'
              )}
            </dd>
          </dl>
        </SectionCard>

        {/* アクセス情報 */}
        <AccessInfo
          eventId={event.id}
          categoryId={category.id}
          outbound={outbound}
          returnRoute={returnRoute}
          sameStartGoal={sameStartGoal}
          isEn={isEn}
          displayOutboundRoute={displayOutboundRoute}
          displayReturnRoute={displayReturnRoute}
          displayOutboundShuttle={displayOutboundShuttle}
          visaInfo={displayVisaInfo}
        />

        {/* 地図 */}
        {event.latitude && event.longitude && (
          <SectionCard title={isEn ? 'Map' : '地図'}>
            <EventMap
              latitude={event.latitude}
              longitude={event.longitude}
              accommodations={accommodations}
              accessRoutes={accessRoutes}
              isEn={isEn}
            />
          </SectionCard>
        )}

        {/* 宿泊情報 */}
        <AccommodationInfo
          eventId={event.id}
          categoryId={category.id}
          accommodations={accommodations}
          isEn={isEn}
          lat={event.latitude}
          lng={event.longitude}
        />

        {/* トータルコスト */}
        <CostBreakdown
          event={event}
          category={category}
          outbound={outbound}
          returnRoute={returnRoute}
          accommodations={accommodations}
          isEn={isEn}
        />

        {/* コースマップ */}
        <CourseMap
          event={event}
          courseMapFiles={courseMapFiles}
          isEn={isEn}
        />

        {/* 過去の開催 */}
        <PastEditions
          event={event}
          category={category}
          pastEditions={pastEditions}
          isEn={isEn}
          formatDate={formatDate}
        />

        {/* 天候 */}
        {displayWeatherForecast && (
          <SectionCard title={isEn ? 'Weather forecast' : '当日の天候は？'}>
            <dl className="grid grid-cols-[minmax(120px,1fr)_minmax(180px,2fr)] gap-x-6 gap-y-3 text-sm">
              <DLRow label={isEn ? 'Expected weather?' : '天気は？'} value={displayWeatherForecast} eventId={event.id} categoryId={category.id} />
            </dl>
          </SectionCard>
        )}

        {/* 周辺の情報 */}
        {(displayRecoveryFacilities || displayPhotoSpots) && (
          <SectionCard title={isEn ? 'Nearby info' : '周辺の情報は？'}>
            <dl className="grid grid-cols-[minmax(120px,1fr)_minmax(180px,2fr)] gap-x-6 gap-y-3 text-sm">
              {displayRecoveryFacilities && <DLRow label={isEn ? 'Recovery facilities / hot springs?' : 'リカバリー施設・温泉は？'} value={displayRecoveryFacilities} />}
              {displayPhotoSpots && <DLRow label={isEn ? 'Photo spots?' : 'フォトスポットは？'} value={displayPhotoSpots} />}
            </dl>
          </SectionCard>
        )}

        {/* ビザ: AccessInfo 内に移動済み */}

        {/* その他 */}
        {(displayEventProhibitedItems || event.furusato_nozei_url) && (
          <SectionCard title={isEn ? 'Other info' : 'その他'}>
            <dl className="grid grid-cols-[minmax(120px,1fr)_minmax(180px,2fr)] gap-x-6 gap-y-3 text-sm">
              {displayEventProhibitedItems && <DLRow label={isEn ? 'Prohibited items?' : '使用禁止品は？'} value={displayEventProhibitedItems} multiline />}
              {event.furusato_nozei_url && (
                <>
                  <dt className="text-muted-foreground">{isEn ? 'Furusato Nozei?' : 'ふるさと納税は？'}</dt>
                  <dd>
                    <a href={event.furusato_nozei_url} target="_blank" rel="noreferrer" className="break-all text-sm text-primary hover:underline">
                      {event.furusato_nozei_url}
                    </a>
                  </dd>
                </>
              )}
            </dl>
          </SectionCard>
        )}

        {/* レースレポート・口コミ */}
        <EventComments
          eventId={event.id}
          categoryId={category.id}
          raceType={event.race_type ?? undefined}
          isEn={isEn}
        />

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
        {(category.updated_at || event.updated_at) && (
          <p className="mt-6 border-t border-border pt-4 text-right text-xs text-muted-foreground/70">
            {isEn ? 'Last updated' : '最終更新'}: <time dateTime={(category.updated_at ?? event.updated_at)!}>{(category.updated_at ?? event.updated_at)!.slice(0, 10)}</time>
          </p>
        )}
        </>
        )}
      </div>
    </>
  )
}

export default CategoryDetail
