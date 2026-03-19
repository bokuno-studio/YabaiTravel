import { useState, useEffect, useMemo } from 'react'
import { Link, useParams, useSearchParams, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Helmet } from 'react-helmet-async'
import { SlidersHorizontal } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import type { EventWithCategories, Category } from '../types/event'
import EventMap from '../components/EventMap'
import { EventCard } from '../components/EventCard'
import { EventCardSkeleton } from '../components/EventCardSkeleton'
import { FiltersSidebar } from '../components/FiltersSidebar'
import { Header } from '../components/Header'
import { Button } from '../components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../components/ui/sheet'

/** interval 文字列から時間数を取得（フィルタ用） */
function parseIntervalHours(v: string | null): number | null {
  if (!v) return null
  const hms = v.match(/^(\d+):(\d+):(\d+)/)
  if (hms) {
    const h = parseInt(hms[1], 10)
    const min = parseInt(hms[2], 10)
    const sec = parseInt(hms[3], 10)
    return h + min / 60 + sec / 3600
  }
  const hourMatch = v.match(/(\d+)\s*hour/)
  const dayMatch = v.match(/(\d+)\s*day/)
  const minMatch = v.match(/(\d+)\s*minute/)
  let hours = 0
  if (hourMatch) hours += parseInt(hourMatch[1], 10)
  if (dayMatch) hours += parseInt(dayMatch[1], 10) * 24
  if (minMatch) hours += parseInt(minMatch[1], 10) / 60
  return hours > 0 ? hours : null
}

/** 距離レンジの定義 */
const DISTANCE_RANGES = [
  { label: '〜10km', min: 0, max: 10 },
  { label: '10〜20km', min: 10, max: 20 },
  { label: '20〜30km', min: 20, max: 30 },
  { label: '30〜50km', min: 30, max: 50 },
  { label: '50〜100km', min: 50, max: 100 },
  { label: '100km〜', min: 100, max: Infinity },
] as const

function EventList() {
  const [events, setEvents] = useState<EventWithCategories[]>([])
  const [searchParams] = useSearchParams()
  const initialType = searchParams.get('type')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [raceTypes, setRaceTypes] = useState<Set<string>>(initialType ? new Set([initialType]) : new Set())
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set())
  const [distanceRanges, setDistanceRanges] = useState<Set<number>>(new Set())
  const [timeLimitMin, setTimeLimitMin] = useState<string>('')
  const [costMin, setCostMin] = useState<number>(0)
  const [costMax, setCostMax] = useState<number>(Infinity)
  const [entryStatus, setEntryStatus] = useState<string>('active')
  const [showPastEvents, setShowPastEvents] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [weeklyNewCount, setWeeklyNewCount] = useState<number>(0)

  useEffect(() => {
    async function fetchEvents() {
      try {
        const { data, error: err } = await supabase
          .from('events')
          .select('*, categories(*)')
          .order('event_date', { ascending: true, nullsFirst: false })

        if (err) throw err
        setEvents(data ?? [])
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.message
            : e && typeof e === 'object' && 'message' in e
              ? String((e as { message: unknown }).message)
              : String(e)
        console.error('[EventList] 取得エラー:', e)
        setError(msg || '取得に失敗しました')
      } finally {
        setLoading(false)
      }
    }

    async function fetchStats() {
      const { data: lastRow } = await supabase
        .from('events')
        .select('collected_at')
        .not('collected_at', 'is', null)
        .order('collected_at', { ascending: false })
        .limit(1)
      if (lastRow?.[0]?.collected_at) setLastUpdated(lastRow[0].collected_at)

      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { count } = await supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .gte('updated_at', weekAgo)
      setWeeklyNewCount(count ?? 0)
    }

    fetchEvents()
    fetchStats()
  }, [])

  /** コスト分布データ（95パーセンタイル超の外れ値を除外してヒストグラムに渡す） */
  const costPrices = useMemo(() => {
    const all = events
      .map((e) => e.total_cost_estimate ? parseInt(e.total_cost_estimate, 10) : NaN)
      .filter((v) => !isNaN(v) && v > 0)
    if (all.length === 0) return all
    const sorted = [...all].sort((a, b) => a - b)
    const p95 = sorted[Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1)]
    return all.filter((v) => v <= p95)
  }, [events])

  const costGlobalMax = useMemo(() => {
    if (costPrices.length === 0) return 100000
    return Math.ceil(Math.max(...costPrices) / 10000) * 10000
  }, [costPrices])

  /** DB に存在するレース種別を定義順で取得（#154） */
  const RACE_TYPE_ORDER = [
    'marathon', 'trail',
    'triathlon', 'duathlon',
    'spartan', 'hyrox', 'tough_mudder', 'obstacle',
    'cycling',
    'rogaining', 'adventure',
    'devils_circuit', 'strong_viking',
    'other',
  ]
  const availableRaceTypes = useMemo(() => {
    const types = new Set<string>()
    events.forEach((e) => {
      if (e.race_type) types.add(e.race_type)
    })
    return RACE_TYPE_ORDER.filter((t) => types.has(t))
  }, [events])

  /** 選択中のレース種別に応じたカテゴリ一覧（#28） */
  const availableCategories = useMemo(() => {
    const filteredEvts =
      raceTypes.size > 0
        ? events.filter((e) => e.race_type && raceTypes.has(e.race_type))
        : events
    const names = new Set<string>()
    filteredEvts.forEach((e) => {
      (e.categories ?? []).forEach((c) => {
        if (c.name) names.add(c.name)
      })
    })
    return [...names].sort()
  }, [events, raceTypes])

  const toggleRaceType = (t: string) => {
    setRaceTypes((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  const toggleCategory = (name: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const toggleMonth = (m: string) => {
    setSelectedMonths((prev) => {
      const next = new Set(prev)
      if (next.has(m)) next.delete(m)
      else next.add(m)
      return next
    })
  }

  /** イベント日付から利用可能な月一覧を生成 */
  const availableMonths = useMemo(() => {
    const months = new Set<string>()
    const today = new Date().toISOString().slice(0, 7)
    events.forEach((e) => {
      if (e.event_date) {
        const ym = e.event_date.slice(0, 7)
        if (!showPastEvents && ym < today) return
        months.add(ym)
      }
    })
    return [...months].sort()
  }, [events, showPastEvents])

  const toggleDistanceRange = (idx: number) => {
    setDistanceRanges((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const categoryMatchesFilter = (cat: Category): boolean => {
    const timeMin = timeLimitMin ? parseFloat(timeLimitMin) : null

    if (distanceRanges.size > 0) {
      if (cat.distance_km == null) return false
      const matchesAny = [...distanceRanges].some((idx) => {
        const range = DISTANCE_RANGES[idx]
        return cat.distance_km! >= range.min && (range.max === Infinity || cat.distance_km! <= range.max)
      })
      if (!matchesAny) return false
    }
    if (timeMin != null) {
      const catHours = parseIntervalHours(cat.time_limit)
      if (catHours == null || catHours < timeMin) return false
    }
    return true
  }

  /** フィルタ条件に合致するカテゴリを返す (#33) */
  const getMatchingCategories = (event: EventWithCategories): Category[] => {
    const cats = event.categories ?? []
    return cats.filter((cat) => {
      if (selectedCategories.size > 0 && !selectedCategories.has(cat.name)) return false
      return categoryMatchesFilter(cat)
    })
  }

  const hasAnyFilter = raceTypes.size > 0 || selectedCategories.size > 0 || selectedMonths.size > 0 || distanceRanges.size > 0 || !!timeLimitMin || costMin > 0 || costMax < Infinity || entryStatus !== 'active' || showPastEvents

  const filtered = events.filter((event) => {
    const today = new Date().toISOString().slice(0, 10)
    // デフォルト: 当日以降のイベントのみ表示（#135）
    if (!showPastEvents && event.event_date && event.event_date < today) return false
    if (raceTypes.size > 0 && (event.race_type == null || !raceTypes.has(event.race_type))) return false
    if (selectedCategories.size > 0) {
      const catNames = new Set((event.categories ?? []).map((c) => c.name))
      const hasMatch = [...selectedCategories].some((name) => catNames.has(name))
      if (!hasMatch) return false
    }
    if (selectedMonths.size > 0 && event.event_date) {
      const ym = event.event_date.slice(0, 7)
      if (!selectedMonths.has(ym)) return false
    }
    if (entryStatus) {
      if (entryStatus === 'active') {
        // 受付中 or 受付前（受付終了を除外）（#135）
        if (event.entry_end && event.entry_end < today) return false
      } else if (entryStatus === 'open') {
        if (!event.entry_start || !event.entry_end) return false
        if (event.entry_start > today || event.entry_end < today) return false
      } else if (entryStatus === 'upcoming') {
        if (!event.entry_start || event.entry_start <= today) return false
      } else if (entryStatus === 'closed') {
        if (!event.entry_end || event.entry_end >= today) return false
      }
    }
    if (costMin > 0 || costMax < Infinity) {
      // 集計未完了（null）はコストフィルターの対象外
      if (!event.total_cost_estimate) return false
      const cost = parseInt(event.total_cost_estimate, 10)
      if (isNaN(cost) || cost < costMin || cost > costMax) return false
    }
    const categories = event.categories ?? []
    const hasCategoryFilter = distanceRanges.size > 0 || timeLimitMin
    if (hasCategoryFilter && categories.length > 0) {
      const hasMatch = categories.some(categoryMatchesFilter)
      if (!hasMatch) return false
    }
    return true
  })

  const { t } = useTranslation()
  const { lang } = useParams<{ lang: string }>()
  const location = useLocation()
  const langPrefix = `/${lang || 'ja'}`

  const raceTypeLabel = (type: string | null) => {
    if (!type) return t('raceType.other')
    return t(`raceType.${type}`, type)
  }

  const handleCostRangeChange = (newMin: number, newMax: number) => {
    setCostMin(newMin)
    setCostMax(newMax)
  }

  const filterContent = (
    <FiltersSidebar
      availableRaceTypes={availableRaceTypes}
      raceTypes={raceTypes}
      onRaceTypeToggle={toggleRaceType}
      raceTypeLabel={raceTypeLabel}
      availableCategories={availableCategories}
      selectedCategories={selectedCategories}
      onCategoryToggle={toggleCategory}
      availableMonths={availableMonths}
      selectedMonths={selectedMonths}
      onMonthToggle={toggleMonth}
      distanceRanges={distanceRanges}
      onDistanceRangeToggle={toggleDistanceRange}
      distanceRangeOptions={DISTANCE_RANGES}
      timeLimitMin={timeLimitMin}
      onTimeLimitChange={setTimeLimitMin}
      costPrices={costPrices}
      costMin={costMin}
      costMax={costMax}
      costGlobalMax={costGlobalMax}
      onCostRangeChange={handleCostRangeChange}
      entryStatus={entryStatus}
      onEntryStatusChange={setEntryStatus}
      showPastEvents={showPastEvents}
      onShowPastEventsChange={setShowPastEvents}
      t={t}
      lang={lang}
    />
  )

  if (error) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 text-center">
        <p className="text-destructive">エラー: {error}</p>
      </div>
    )
  }

  return (
    <>
      <Helmet>
        <title>エンデュランス大会を探す | yabai.travel</title>
        <meta name="description" content="トレラン・スパルタン・HYROX・マラソンなどエンデュランス系大会の情報、アクセス・宿泊コストをまとめて比較できるポータルサイト。" />
        <meta property="og:title" content="エンデュランス大会を探す | yabai.travel" />
        <meta property="og:description" content="トレラン・スパルタン・HYROX・マラソンなどエンデュランス系大会の情報、アクセス・宿泊コストをまとめて比較できるポータルサイト。" />
        <meta property="og:url" content="https://yabai-travel.vercel.app/ja" />
        <link rel="canonical" href={`https://yabai-travel.vercel.app${location.pathname}`} />
        <link rel="alternate" hrefLang="ja" href={`https://yabai-travel.vercel.app${location.pathname}`} />
        <link rel="alternate" hrefLang="en" href={`https://yabai-travel.vercel.app${location.pathname}?lang=en`} />
        <link rel="alternate" hrefLang="x-default" href={`https://yabai-travel.vercel.app${location.pathname}`} />
      </Helmet>

      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
        <Header
          title={t('site.title')}
          subtitle={t('site.subtitle')}
          lastUpdated={lastUpdated}
          weeklyNewCount={weeklyNewCount}
          statsLastUpdatedLabel={t('stats.lastUpdated')}
          statsWeeklyNewLabel={t('stats.weeklyNew')}
        />

        <div className="flex gap-6 lg:gap-8">
          {/* Desktop Sidebar */}
          <aside className="hidden w-72 shrink-0 lg:block">
            <div className="sticky top-6 rounded-xl border border-border bg-card p-5 shadow-sm">
              {filterContent}
            </div>
          </aside>

          {/* Main Content */}
          <div className="min-w-0 flex-1">
            {/* Toolbar */}
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Mobile Filter Button */}
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="sm" className="lg:hidden">
                      <SlidersHorizontal className="mr-1.5 h-4 w-4" />
                      {lang === 'en' ? 'Filters' : 'フィルター'}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-80 overflow-y-auto">
                    <SheetHeader>
                      <SheetTitle>{lang === 'en' ? 'Filters' : 'フィルター'}</SheetTitle>
                    </SheetHeader>
                    <div className="mt-4 px-4">
                      {filterContent}
                    </div>
                  </SheetContent>
                </Sheet>

                <span className="text-sm text-muted-foreground">
                  {loading ? '...' : `${filtered.length} ${lang === 'en' ? 'events' : '件'}`}
                </span>
              </div>
            </div>

            {/* Map */}
            {!loading && (
              <div className="mb-6">
                <EventMap events={filtered} langPrefix={langPrefix} raceTypeLabel={raceTypeLabel} />
              </div>
            )}

            {/* Event List */}
            {loading ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <EventCardSkeleton key={i} />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16">
                <p className="text-base font-medium text-foreground">
                  {t('event.empty')}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {lang === 'en' ? 'Try adjusting your filters' : 'フィルターを調整してみてください'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {filtered.map((event) => {
                  const matchingCats = getMatchingCategories(event)
                  // フィルタで1件に絞られた場合は直接カテゴリへ、それ以外はイベント詳細へ (#33)
                  const cardLink = hasAnyFilter && matchingCats.length === 1
                    ? `${langPrefix}/events/${event.id}/categories/${matchingCats[0].id}`
                    : `${langPrefix}/events/${event.id}`
                  // フィルタ適用中は合致するカテゴリチップのみ表示 (#33)
                  const chipsToShow = hasAnyFilter && matchingCats.length > 0
                    ? matchingCats
                    : (event.categories ?? [])
                  // enrich完了判定: location + カテゴリ充足度 (#63, #71)
                  const cats = event.categories ?? []
                  const isEnriched = event.location != null && (
                    cats.length === 0 || cats.some(c => c.distance_km != null || c.elevation_gain != null)
                  )
                  return (
                    <EventCard
                      key={event.id}
                      event={event}
                      langPrefix={langPrefix}
                      raceTypeLabel={raceTypeLabel}
                      cardLink={cardLink}
                      chipsToShow={chipsToShow}
                      isEnriched={isEnriched}
                      t={t}
                      lang={lang}
                    />
                  )
                })}
              </div>
            )}

            {/* Footer */}
            <div className="mt-8 border-t border-border pt-4 text-center">
              <Link
                to={`${langPrefix}/sources`}
                className="text-sm text-muted-foreground transition-colors hover:text-primary"
              >
                {lang === 'en' ? 'Data Sources' : '情報取得元'}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default EventList
