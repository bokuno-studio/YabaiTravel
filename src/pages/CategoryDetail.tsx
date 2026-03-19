import { useEffect, useState } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { categoryToJsonLd } from '../lib/jsonld'
import { supabase } from '../lib/supabaseClient'
import type { Event, AccessRoute, Accommodation, Category, CourseMapFile, StayStatus } from '../types/event'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  ExternalLink,
  FileEdit,
  Train,
  Home,
  Map,
  Clock,
  Mountain,
  TrendingUp,
  Banknote,
  Calendar,
  MapPin,
  Users,
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

function CategoryDetail() {
  const { eventId, categoryId, lang } = useParams<{ eventId: string; categoryId: string; lang: string }>()
  const location = useLocation()
  const langPrefix = `/${lang || 'ja'}`
  const [event, setEvent] = useState<Event | null>(null)
  const [category, setCategory] = useState<Category | null>(null)
  const [accessRoutes, setAccessRoutes] = useState<AccessRoute[]>([])
  const [accommodations, setAccommodations] = useState<Accommodation[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [courseMapFiles, setCourseMapFiles] = useState<CourseMapFile[]>([])
  const [pastEditions, setPastEditions] = useState<Array<{ event: Event; courseMaps: CourseMapFile[]; categories: Category[] }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  const stayStatusLabel = (s: StayStatus | null) => {
    if (!s) return null
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

  const raceTypeLabel = (t: string | null) => {
    if (!t) return 'その他'
    const map: Record<string, string> = {
      marathon: 'マラソン',
      trail: 'トレラン',
      spartan: 'スパルタン',
      adventure: 'アドベンチャー',
      hyrox: 'HYROX',
      devils_circuit: 'Devils Circuit',
      strong_viking: 'Strong Viking',
      obstacle: 'オブスタクル',
    }
    return map[t] ?? t
  }

  const formatInterval = (v: string | null) => {
    if (!v) return null
    const hms = v.match(/^(\d+):(\d+):(\d+)/)
    if (hms) {
      const h = parseInt(hms[1], 10)
      const min = parseInt(hms[2], 10)
      const sec = parseInt(hms[3], 10)
      const parts = []
      if (h > 0) parts.push(`${h}時間`)
      if (min > 0) parts.push(`${min}分`)
      if (sec > 0 && h === 0 && min === 0) parts.push(`${sec}秒`)
      return parts.length ? parts.join('') : v
    }
    const dayMatch = v.match(/(\d+)\s*day/)
    const hourMatch = v.match(/(\d+)\s*hour/)
    const minMatch = v.match(/(\d+)\s*minute/)
    if (dayMatch || hourMatch || minMatch) {
      const parts = []
      if (dayMatch) parts.push(`${parseInt(dayMatch[1], 10)}日`)
      if (hourMatch) parts.push(`${parseInt(hourMatch[1], 10)}時間`)
      if (minMatch) parts.push(`${parseInt(minMatch[1], 10)}分`)
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
        <p className="sr-only">読み込み中...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center">
        <p className="text-destructive">エラー: {error}</p>
      </div>
    )
  }

  if (!event || !category) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center">
        <p className="text-muted-foreground">見つかりません</p>
      </div>
    )
  }

  const outbound = accessRoutes.find((r) => r.direction === 'outbound')
  const returnRoute = accessRoutes.find((r) => r.direction === 'return')
  const sameStartGoal = !returnRoute || (outbound?.route_detail === returnRoute?.route_detail)
  const stayStatus = category.stay_status ?? event.stay_status

  const dateDisplay = event.event_date_end && event.event_date_end !== event.event_date
    ? `${event.event_date}〜${event.event_date_end}`
    : event.event_date

  /** Helper to render a definition list row */
  const DLRow = ({ label, value, multiline }: { label: string; value: string | null | undefined; multiline?: boolean }) => (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn(
        !value || value === '—' ? 'italic text-muted-foreground/60' : '',
        multiline && 'whitespace-pre-wrap',
      )}>
        {value ?? '—'}
      </dd>
    </>
  )

  return (
    <>
      <Helmet>
        <title>{event.name} {category.name} | yabai.travel</title>
        <meta name="description" content={`${event.name} ${category.name}コースの参加費・アクセス・宿泊・必携品をまとめてチェック。`} />
        <meta property="og:title" content={`${event.name} ${category.name} | yabai.travel`} />
        <meta property="og:description" content={`${event.name} ${category.name}コースの参加費・アクセス・宿泊・必携品をまとめてチェック。`} />
        <meta property="og:url" content={`https://yabai-travel.vercel.app/ja/events/${event.id}/categories/${category.id}`} />
        <link rel="canonical" href={`https://yabai-travel.vercel.app${location.pathname}`} />
        <link rel="alternate" hrefLang="ja" href={`https://yabai-travel.vercel.app${location.pathname}`} />
        <link rel="alternate" hrefLang="en" href={`https://yabai-travel.vercel.app${location.pathname}?lang=en`} />
        <link rel="alternate" hrefLang="x-default" href={`https://yabai-travel.vercel.app${location.pathname}`} />
        <script type="application/ld+json">{JSON.stringify(categoryToJsonLd(event, category))}</script>
      </Helmet>
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-6">
        {/* Breadcrumb */}
        <div className="mb-6 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <Link
            to={langPrefix}
            className="transition-colors hover:text-primary"
          >
            一覧
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link
            to={`${langPrefix}/events/${eventId}`}
            className="transition-colors hover:text-primary"
          >
            {event.name}
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground">{category.name}</span>
        </div>

        {/* Hero */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            {event.name} — {category.name}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 shrink-0 text-primary/70" />
              {dateDisplay}
            </span>
            {event.location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                {event.location}
              </span>
            )}
            {event.participant_count != null && (
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                約{event.participant_count.toLocaleString()}人
              </span>
            )}
          </div>

          {/* Badges */}
          <div className="mt-3 flex flex-wrap gap-2">
            {stayStatus && (
              <Badge
                variant="outline"
                className={cn('border text-xs', stayStatusColors[stayStatus])}
              >
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

          {/* External links */}
          {(event.official_url || event.entry_url) && (
            <div className="mt-3 flex gap-3">
              {event.official_url && (
                <Button asChild variant="outline" size="sm">
                  <a href={event.official_url} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    公式
                  </a>
                </Button>
              )}
              {event.entry_url && (
                <Button asChild variant="outline" size="sm">
                  <a href={event.entry_url} target="_blank" rel="noreferrer">
                    <FileEdit className="mr-1.5 h-3.5 w-3.5" />
                    申込
                  </a>
                </Button>
              )}
            </div>
          )}
        </div>

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
                {c.name}
              </Link>
            ))}
          </div>
        )}

        {/* レーススペック */}
        <SectionCard title="このレースのスペックは？" icon={<Mountain className="h-4 w-4 text-primary" />}>
          {/* Quick stats grid */}
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {category.distance_km != null && (
              <StatBox icon={<TrendingUp className="h-4 w-4" />} label="距離" value={`${category.distance_km}km`} />
            )}
            {category.elevation_gain != null && (
              <StatBox icon={<Mountain className="h-4 w-4" />} label="獲得標高" value={`${category.elevation_gain}m`} />
            )}
            {category.time_limit && (
              <StatBox icon={<Clock className="h-4 w-4" />} label="制限時間" value={formatInterval(category.time_limit) ?? '—'} />
            )}
            {category.entry_fee != null && (
              <StatBox icon={<Banknote className="h-4 w-4" />} label="参加費" value={`${category.entry_fee.toLocaleString()} ${category.entry_fee_currency ?? '円'}`} />
            )}
          </div>

          <dl className="grid grid-cols-[minmax(120px,1fr)_minmax(180px,2fr)] gap-x-6 gap-y-3 text-sm">
            <DLRow label="スタートは何時？" value={category.start_time ? `${category.start_time} スタート` : null} />
            <DLRow label="受付は何時まで？" value={category.reception_end} />
            <DLRow label="受付場所は？" value={category.reception_place ?? event.reception_place} />
            <DLRow label="スタート場所は？" value={category.start_place ?? event.start_place} />
            <DLRow label="完走率は？" value={category.finish_rate != null ? `${(category.finish_rate * 100).toFixed(1)}%` : null} />
            <dt className="text-muted-foreground">カットオフは？</dt>
            <dd className={cn(
              formatCutoffTimes(category.cutoff_times) ? 'whitespace-pre-wrap' : 'italic text-muted-foreground/60',
            )}>
              {formatCutoffTimes(category.cutoff_times) ?? '—'}
            </dd>
            <DLRow
              label="必要なペースは？"
              value={category.required_pace ?? (() => {
                if (category.distance_km && category.time_limit) {
                  const parts = category.time_limit.match(/(\d+):(\d+):(\d+)/)
                  if (parts) {
                    const totalMin = parseInt(parts[1]) * 60 + parseInt(parts[2]) + parseInt(parts[3]) / 60
                    const paceMin = totalMin / category.distance_km
                    const m = Math.floor(paceMin)
                    const s = Math.round((paceMin - m) * 60)
                    return `${m}:${String(s).padStart(2, '0')} /km（制限時間から算出）`
                  }
                }
                return null
              })()}
            />
            <DLRow label="登りに必要なペースは？" value={category.required_climb_pace} />
            <DLRow label="必携品は？" value={category.mandatory_gear} multiline />
            <DLRow label="持っておくと良いものは？" value={category.recommended_gear} multiline />
            <DLRow label="使用禁止品は？" value={category.prohibited_items} />
            <DLRow label="ポールは使える？" value={category.poles_allowed != null ? (category.poles_allowed ? '可' : '不可') : null} />
            <DLRow
              label="参加費はいくら？"
              value={category.entry_fee != null ? `${category.entry_fee.toLocaleString()} ${category.entry_fee_currency ?? '円'}` : null}
            />
          </dl>
        </SectionCard>

        {/* 申込み */}
        <SectionCard title="申込み" icon={<FileEdit className="h-4 w-4 text-primary" />}>
          <dl className="grid grid-cols-[minmax(120px,1fr)_minmax(180px,2fr)] gap-x-6 gap-y-3 text-sm">
            <DLRow
              label="エントリ方法は？"
              value={event.entry_type === 'lottery' ? '抽選' : event.entry_type === 'first_come' ? '先着' : event.entry_type}
            />
            <DLRow label="参加資格はある？" value={event.required_qualification} />
            <DLRow label="ITRAポイントは？" value={category.itra_points} />
            <DLRow label="いつから申し込める？" value={event.entry_start} />
            <DLRow label="申込み締切はいつ？" value={event.entry_end} />
            <dt className="text-muted-foreground">例年の申込時期は？</dt>
            <dd className={event.entry_start_typical ? '' : 'italic text-muted-foreground/60'}>
              {event.entry_start_typical && event.entry_end_typical ? (
                <>
                  {formatDate(event.entry_start_typical)}〜{formatDate(event.entry_end_typical)}
                  <span className="mt-0.5 block text-xs text-muted-foreground">（今年の申込開始の目安）</span>
                </>
              ) : (
                '—'
              )}
            </dd>
          </dl>
        </SectionCard>

        {/* 公共交通機関で行けるか */}
        <SectionCard title="公共交通機関で行けるか" icon={<Train className="h-4 w-4 text-primary" />}>
          {outbound?.transit_accessible != null && (
            <p className={cn(
              'mb-3 rounded-lg px-3 py-2 text-sm font-medium',
              outbound.transit_accessible
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-red-50 text-red-700',
            )}>
              {outbound.transit_accessible ? '✅ 公共交通機関で行ける' : '❌ 公共交通機関では行きにくい（要車・要シャトル）'}
            </p>
          )}
          <div className="flex flex-wrap gap-4">
            <div className="flex items-baseline gap-2 text-sm">
              <span className="min-w-[2.5em] font-semibold text-muted-foreground">往路</span>
              <span className={outbound?.total_time_estimate ? '' : 'italic text-muted-foreground/60'}>{outbound?.total_time_estimate ?? '—'}</span>
              {outbound?.cost_estimate && <span className="font-medium text-primary">{outbound.cost_estimate}</span>}
            </div>
            <div className="flex items-baseline gap-2 text-sm">
              <span className="min-w-[2.5em] font-semibold text-muted-foreground">復路</span>
              <span className={returnRoute?.total_time_estimate ? '' : 'italic text-muted-foreground/60'}>{returnRoute?.total_time_estimate ?? '—'}</span>
              {returnRoute?.cost_estimate && <span className="font-medium text-primary">{returnRoute.cost_estimate}</span>}
            </div>
          </div>
        </SectionCard>

        {/* 何日必要か */}
        <SectionCard title="何日必要か" icon={<Home className="h-4 w-4 text-primary" />}>
          <dl className="grid grid-cols-[minmax(120px,1fr)_minmax(180px,2fr)] gap-x-6 gap-y-3 text-sm">
            <DLRow label="前泊は必要？" value={stayStatus ? stayStatusLabel(stayStatus) : null} />
            <DLRow
              label="どこに泊まればいい？"
              value={accommodations.some((a) => a.recommended_area)
                ? accommodations.map((a) => a.recommended_area).filter(Boolean).join('、')
                : null}
            />
            <DLRow
              label="宿泊費の目安は？"
              value={accommodations.some((a) => a.avg_cost_3star != null)
                ? `約${accommodations.find((a) => a.avg_cost_3star != null)?.avg_cost_3star?.toLocaleString()}円`
                : null}
            />
          </dl>
        </SectionCard>

        {/* トータルコスト */}
        <SectionCard title="トータルコストはいくら？" icon={<Banknote className="h-4 w-4 text-primary" />}>
          {event.total_cost_estimate && (
            <div className="mb-3 rounded-lg bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary">
              {event.total_cost_estimate}
            </div>
          )}
          <dl className="grid grid-cols-[minmax(120px,1fr)_minmax(180px,2fr)] gap-x-6 gap-y-3 text-sm">
            <DLRow
              label="参加費はいくら？"
              value={category.entry_fee != null ? `${category.entry_fee.toLocaleString()} ${category.entry_fee_currency ?? '円'}` : null}
            />
            <DLRow label="行きの交通費は？" value={outbound?.cost_estimate} />
            <DLRow label="帰りの交通費は？" value={returnRoute?.cost_estimate} />
            <DLRow
              label="宿泊費は？"
              value={accommodations.some((a) => a.avg_cost_3star != null)
                ? `約${accommodations.find((a) => a.avg_cost_3star != null)?.avg_cost_3star?.toLocaleString()}円`
                : null}
            />
          </dl>
        </SectionCard>

        {/* どうやって行く？ */}
        <SectionCard title="どうやって行く？" icon={<Train className="h-4 w-4 text-primary" />}>
          <h3 className="mb-2 text-sm font-semibold text-foreground">往路</h3>
          <dl className="grid grid-cols-[minmax(120px,1fr)_minmax(180px,2fr)] gap-x-6 gap-y-3 text-sm">
            <DLRow label="どのルートで行く？" value={outbound?.route_detail} multiline />
            <DLRow label="所要時間は？" value={outbound?.total_time_estimate} />
            <DLRow label="費用の目安は？" value={outbound?.cost_estimate} />
            <DLRow label="現金は必要？" value={outbound?.cash_required != null ? (outbound.cash_required ? 'あり' : 'なし') : null} />
            <dt className="text-muted-foreground">予約サイトは？</dt>
            <dd className={outbound?.booking_url ? '' : 'italic text-muted-foreground/60'}>
              {outbound?.booking_url
                ? <a href={outbound.booking_url} target="_blank" rel="noreferrer" className="break-all text-primary hover:underline">{outbound.booking_url}</a>
                : '—'}
            </dd>
            <DLRow label="シャトルバスはある？" value={outbound?.shuttle_available} />
            <DLRow label="タクシーは？" value={outbound?.taxi_estimate} />
          </dl>
          {sameStartGoal ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {lang === 'en' ? 'Start and finish are at the same location. Return route is the same as outbound.' : 'スタート・ゴール同一のため、復路は往路と同様です。'}
            </p>
          ) : (
            <>
              <h3 className="mb-2 mt-4 text-sm font-semibold text-foreground">復路</h3>
              <dl className="grid grid-cols-[minmax(120px,1fr)_minmax(180px,2fr)] gap-x-6 gap-y-3 text-sm">
                <DLRow label="どのルートで行く？" value={returnRoute?.route_detail} multiline />
                <DLRow label="所要時間は？" value={returnRoute?.total_time_estimate} />
                <DLRow label="費用の目安は？" value={returnRoute?.cost_estimate} />
              </dl>
            </>
          )}
        </SectionCard>

        {/* コースマップ */}
        <SectionCard title="コースマップはある？" icon={<Map className="h-4 w-4 text-primary" />}>
          {courseMapFiles.length > 0 ? (
            <>
              <p className="mb-2 text-sm text-muted-foreground">サイト内保管</p>
              <ul className="space-y-1.5">
                {courseMapFiles.map((cm) => (
                  <li key={cm.id}>
                    <a
                      href={cm.file_path}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      {cm.display_name ?? (cm.year ? `${cm.year}年コース` : 'コースマップ')}
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">レース終了後も参照できます</p>
            </>
          ) : event.course_map_url ? (
            <>
              <p className="mb-1 text-sm text-muted-foreground">外部リンク</p>
              <a href={event.course_map_url} target="_blank" rel="noreferrer" className="break-all text-sm text-primary hover:underline">
                {event.course_map_url}
              </a>
            </>
          ) : (
            <p className="text-sm italic text-muted-foreground/60">—</p>
          )}
        </SectionCard>

        {/* 去年のレース */}
        {event.previous_edition_url && (
          <SectionCard title="去年のレース">
            <a
              href={event.previous_edition_url}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-primary hover:underline"
            >
              去年のレースはこちら
            </a>
          </SectionCard>
        )}

        {/* 過去の開催 */}
        {pastEditions.length > 0 && (
          <SectionCard title="過去の開催">
            <p className="mb-3 text-sm text-muted-foreground">去年のコースマップ・申込期間・料金の参考</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {pastEditions.map(({ event: pe, courseMaps, categories: pastCats }) => {
                const year = pe.event_date?.slice(0, 4)
                const sameCat = pastCats.find((c) => c.name === category?.name)
                return (
                  <Card key={pe.id} className="bg-secondary/30 py-4">
                    <CardContent className="px-4">
                      <h3 className="mb-2 text-sm font-bold text-primary">{year}年</h3>
                      <dl className="grid grid-cols-[minmax(80px,1fr)_1fr] gap-x-4 gap-y-2 text-xs">
                        {pe.entry_start_typical && (
                          <>
                            <dt className="text-muted-foreground">申込期間</dt>
                            <dd>{formatDate(pe.entry_start_typical)}〜{formatDate(pe.entry_end_typical)}</dd>
                          </>
                        )}
                        {sameCat?.entry_fee != null && (
                          <>
                            <dt className="text-muted-foreground">{sameCat.name} 申込費</dt>
                            <dd>{sameCat.entry_fee.toLocaleString()} {sameCat.entry_fee_currency ?? '円'}</dd>
                          </>
                        )}
                        {courseMaps.length > 0 && (
                          <>
                            <dt className="text-muted-foreground">コースマップ</dt>
                            <dd className="flex flex-wrap gap-2">
                              {courseMaps.map((cm) => (
                                <a key={cm.id} href={cm.file_path} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                                  {cm.display_name ?? `${cm.year}年`}
                                </a>
                              ))}
                            </dd>
                          </>
                        )}
                      </dl>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </SectionCard>
        )}

        {/* 天候 */}
        {event.weather_forecast && (
          <SectionCard title="当日の天候は？">
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{event.weather_forecast}</p>
          </SectionCard>
        )}

        {/* 周辺の情報 */}
        {(event.recovery_facilities || event.photo_spots) && (
          <SectionCard title="周辺の情報は？">
            <dl className="grid grid-cols-[minmax(120px,1fr)_minmax(180px,2fr)] gap-x-6 gap-y-3 text-sm">
              {event.recovery_facilities && <DLRow label="リカバリー施設・温泉は？" value={event.recovery_facilities} />}
              {event.photo_spots && <DLRow label="フォトスポットは？" value={event.photo_spots} />}
            </dl>
          </SectionCard>
        )}

        {/* ビザ */}
        {event.visa_info && (
          <SectionCard title="ビザは必要？">
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{event.visa_info}</p>
          </SectionCard>
        )}

        {/* その他 */}
        {(event.prohibited_items || event.furusato_nozei_url) && (
          <SectionCard title="その他">
            <dl className="grid grid-cols-[minmax(120px,1fr)_minmax(180px,2fr)] gap-x-6 gap-y-3 text-sm">
              {event.prohibited_items && <DLRow label="使用禁止品は？" value={event.prohibited_items} />}
              {event.furusato_nozei_url && (
                <>
                  <dt className="text-muted-foreground">ふるさと納税は？</dt>
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

        {/* 最終更新 */}
        {(category.updated_at || event.updated_at) && (
          <p className="mt-6 border-t border-border pt-4 text-right text-xs text-muted-foreground/70">
            最終更新: <time dateTime={(category.updated_at ?? event.updated_at)!}>{(category.updated_at ?? event.updated_at)!.slice(0, 10)}</time>
          </p>
        )}
      </div>
    </>
  )
}

/** Reusable section card wrapper */
function SectionCard({
  title,
  icon,
  children,
}: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

/** Quick stat box for the top grid */
function StatBox({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex flex-col items-center rounded-lg bg-secondary/50 p-3 text-center">
      <span className="text-primary/70">{icon}</span>
      <span className="mt-1 text-base font-bold text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

export default CategoryDetail
