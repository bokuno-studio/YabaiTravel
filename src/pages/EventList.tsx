import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react'
import { useParams, useSearchParams, useLocation, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabaseClient'
import type { EventWithCategories, Category } from '../types/event'
import LazyLoadWrapper from '../components/LazyLoadWrapper'
import { useAuth } from '@/lib/auth'
import { isAuthError, handleAuthError } from '@/lib/authErrorHandler'

const EventMap = lazy(() => import('../components/EventMap'))
import { EventCard } from '../components/EventCard'
import { EventCardSkeleton } from '../components/EventCardSkeleton'
import { getActiveFilterChips } from '../components/FiltersSidebar'
import type { FiltersSidebarProps } from '../components/FiltersSidebar'
import SidebarFilters from '../components/SidebarFilters'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { MapIcon, MapPinOff, SlidersHorizontal, X, RotateCcw } from 'lucide-react'
import { useSidebarFilter } from '@/contexts/SidebarFilterContext'
import { useSidebarStats } from '@/contexts/SidebarStatsContext'
import { getFilterState, saveFilterState, resetFilterState } from '@/lib/filterStore'
import { useScrollDepth } from '@/hooks/useScrollDepth'

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

/** 距離レンジの定義（言語に応じてラベルを切り替え） */
function getDistanceRanges(isEn: boolean) {
  const sep = isEn ? '-' : '\u301C'
  return [
    { label: `${sep}10km`, min: 0, max: 10 },
    { label: `10${sep}20km`, min: 10, max: 20 },
    { label: `20${sep}30km`, min: 20, max: 30 },
    { label: `30${sep}50km`, min: 30, max: 50 },
    { label: `50${sep}100km`, min: 50, max: 100 },
    { label: `100km${sep}`, min: 100, max: Infinity },
  ] as const
}

/** Helper: parse Set<string> from URL param */
function parseSetParam(searchParams: URLSearchParams, key: string): Set<string> {
  const val = searchParams.get(key)
  if (!val) return new Set()
  return new Set(val.split(',').filter(Boolean))
}

/** Helper: parse Set<number> from URL param */
function parseNumSetParam(searchParams: URLSearchParams, key: string): Set<number> {
  const val = searchParams.get(key)
  if (!val) return new Set()
  return new Set(val.split(',').filter(Boolean).map(Number))
}

/** Use SSR-prefetched events if available, clear after use */
function getSSREvents(): EventWithCategories[] | null {
  if (typeof window !== 'undefined' && window.__SSR_EVENTS__) {
    const data = window.__SSR_EVENTS__ as EventWithCategories[]
    delete window.__SSR_EVENTS__
    return data
  }
  return null
}

declare global {
  interface Window {
    __SSR_EVENTS__?: unknown
  }
}

function EventList() {
  const { t } = useTranslation()
  const { lang } = useParams<{ lang: string }>()
  const isEn = lang === 'en'
  const location = useLocation()
  const langPrefix = `/${lang || 'ja'}`
  const { isSupporter } = useAuth()
  const DISTANCE_RANGES = useMemo(() => getDistanceRanges(isEn), [isEn])
  useScrollDepth('event_list')

  // Use SSR-prefetched data if available to eliminate client fetch latency
  const ssrEvents = useMemo(() => getSSREvents(), [])
  const [events, setEvents] = useState<EventWithCategories[]>(ssrEvents ?? [])
  const [searchParams, setSearchParams] = useSearchParams()
  const [loading, setLoading] = useState(!ssrEvents)
  const [error, setError] = useState<string | null>(null)

  // Restore filter state from global store (survives unmount)
  const saved = getFilterState()

  const [raceTypes, setRaceTypes] = useState<Set<string>>(() => {
    const fromParams = parseSetParam(searchParams, 'raceTypes')
    if (fromParams.size > 0) return fromParams
    const initialType = searchParams.get('type')
    if (initialType) return new Set([initialType])
    return new Set(saved.raceTypes)
  })
  const [dateRangeStart, setDateRangeStart] = useState<string | null>(() => {
    const fromParams = searchParams.get('date_from')
    return fromParams ?? (saved.dateRangeStart ?? null)
  })
  const [dateRangeEnd, setDateRangeEnd] = useState<string | null>(() => {
    const fromParams = searchParams.get('date_to')
    return fromParams ?? (saved.dateRangeEnd ?? null)
  })

  const [distanceRanges, setDistanceRanges] = useState<Set<number>>(() => {
    const fromParams = parseNumSetParam(searchParams, 'distances')
    return fromParams.size > 0 ? fromParams : new Set(saved.distanceRanges)
  })
  const [timeLimitMin, setTimeLimitMin] = useState<string>(() => searchParams.get('timeLimitMin') ?? saved.timeLimitMin)
  const [costMin, setCostMin] = useState<number>(() => {
    const v = searchParams.get('costMin')
    return v ? Number(v) : saved.costMin
  })
  const [costMax, setCostMax] = useState<number>(() => {
    const v = searchParams.get('costMax')
    return v ? Number(v) : saved.costMax
  })
  const [poleFilter, setPoleFilter] = useState<string>(() => searchParams.get('poleFilter') ?? saved.poleFilter)
  const [entryStatus, setEntryStatus] = useState<string>(() => searchParams.get('entryStatus') ?? saved.entryStatus)
  const [showPastEvents, setShowPastEvents] = useState(() => searchParams.get('showPast') === '1' || saved.showPastEvents)
  // Default map hidden on mobile to avoid loading Google Maps API
  const [showMap, setShowMap] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 960 : false
  )

  // #5, #6: Push stats to context for sidebar
  const { setLastUpdated: setSidebarLastUpdated, setWeeklyNewCount: setSidebarWeeklyNewCount } = useSidebarStats()

  // Sync filter state to global store + URL params
  useEffect(() => {
    saveFilterState({
      raceTypes: [...raceTypes],
      dateRangeStart,
      dateRangeEnd,
      distanceRanges: [...distanceRanges],
      timeLimitMin,
      costMin,
      costMax,
      poleFilter,
      entryStatus,
      showPastEvents,
    })
    const params = new URLSearchParams()
    if (raceTypes.size > 0) params.set('raceTypes', [...raceTypes].join(','))
    if (dateRangeStart) params.set('date_from', dateRangeStart)
    if (dateRangeEnd) params.set('date_to', dateRangeEnd)
    // Old: if (selectedMonths.size > 0) params.set('months', [dateRangeStart, dateRangeEnd]].join(','))
    if (distanceRanges.size > 0) params.set('distances', [...distanceRanges].join(','))
    if (timeLimitMin) params.set('timeLimitMin', timeLimitMin)
    if (costMin > 0) params.set('costMin', String(costMin))
    if (costMax < Infinity) params.set('costMax', String(costMax))
    if (poleFilter) params.set('poleFilter', poleFilter)
    if (entryStatus !== 'active') params.set('entryStatus', entryStatus)
    if (showPastEvents) params.set('showPast', '1')
    setSearchParams(params, { replace: true })
  }, [raceTypes, dateRangeStart, dateRangeEnd, distanceRanges, timeLimitMin, costMin, costMax, poleFilter, entryStatus, showPastEvents, setSearchParams])

  useEffect(() => {
    async function fetchEvents() {
      try {
        // Supabaseのデフォルト1000件制限を回避して全件取得
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allEvents: any[] = []
        let from = 0
        const PAGE_SIZE = 1000
        while (true) {
          const { data: page, error: err } = await supabase
            .from('events')
            .select('*, categories(*)')
            .order('event_date', { ascending: true, nullsFirst: false })
            .range(from, from + PAGE_SIZE - 1)
          if (err) {
            // 認証エラーの場合は自動サインアウト
            if (isAuthError(err)) {
              await handleAuthError(supabase)
              return
            }
            throw err
          }
          if (!page || page.length === 0) break
          allEvents.push(...page)
          if (page.length < PAGE_SIZE) break
          from += PAGE_SIZE
        }
        setEvents(allEvents)
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
      const { data: lastRow, error: lastRowErr } = await supabase
        .from('events')
        .select('collected_at')
        .not('collected_at', 'is', null)
        .order('collected_at', { ascending: false })
        .limit(1)
      if (lastRowErr) {
        // 認証エラーの場合は自動サインアウト
        if (isAuthError(lastRowErr)) {
          await handleAuthError(supabase)
          return
        }
      }
      if (lastRow?.[0]?.collected_at) setSidebarLastUpdated(lastRow[0].collected_at)

      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { count, error: countErr } = await supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .gte('updated_at', weekAgo)
      if (countErr) {
        // 認証エラーの場合は自動サインアウト
        if (isAuthError(countErr)) {
          await handleAuthError(supabase)
          return
        }
      }
      setSidebarWeeklyNewCount(count ?? 0)
    }

    // If SSR data is available, do a background refresh to get full dataset (including past events)
    if (ssrEvents) {
      // Defer full fetch to after initial render to avoid blocking
      const timer = setTimeout(() => { fetchEvents() }, 100)
      fetchStats()
      return () => clearTimeout(timer)
    }

    fetchEvents()
    fetchStats()
  }, [setSidebarLastUpdated, setSidebarWeeklyNewCount, ssrEvents])

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
    'spartan', 'hyrox', 'tough_mudder',
    'cycling',
    'adventure',
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


  const toggleRaceType = (t: string) => {
    setRaceTypes((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
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
      return categoryMatchesFilter(cat)
    })
  }

  const hasAnyFilter = raceTypes.size > 0 || distanceRanges.size > 0 || !!timeLimitMin || costMin > 0 || costMax < Infinity || !!poleFilter || entryStatus !== 'active' || showPastEvents

  // #2: Reset all filters
  const resetAllFilters = useCallback(() => {
    setRaceTypes(new Set())
    setDistanceRanges(new Set())
    setTimeLimitMin('')
    setCostMin(0)
    setCostMax(Infinity)
    setPoleFilter('')
    setEntryStatus('active')
    setShowPastEvents(false)
    resetFilterState()
  }, [])

  const filtered = events.filter((event) => {
    const today = new Date().toISOString().slice(0, 10)
    // デフォルト: 当日以降のイベントのみ表示（#135）
    if (!showPastEvents && event.event_date && event.event_date < today) return false
    if (raceTypes.size > 0 && (event.race_type == null || !raceTypes.has(event.race_type))) return false
    if ((dateRangeStart || dateRangeEnd) && event.event_date) {
      if (dateRangeStart && event.event_date < dateRangeStart) return false
      if (dateRangeEnd && event.event_date > dateRangeEnd) return false
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
    if (poleFilter) {
      if (categories.length === 0) return false
      if (poleFilter === 'allowed' && !categories.some(c => c.poles_allowed === true)) return false
      if (poleFilter === 'prohibited' && !categories.some(c => c.poles_allowed === false)) return false
    }
    const hasCategoryFilter = distanceRanges.size > 0 || timeLimitMin
    if (hasCategoryFilter && categories.length > 0) {
      const hasMatch = categories.some(categoryMatchesFilter)
      if (!hasMatch) return false
    }
    return true
  })

  const raceTypeLabel = (type: string | null) => {
    if (!type) return t('raceType.other')
    return t(`raceType.${type}`, type)
  }

  const handleCostRangeChange = (newMin: number, newMax: number) => {
    setCostMin(newMin)
    setCostMax(newMax)
  }

  const onDateRangeChange = (start: string | null, end: string | null) => {
    setDateRangeStart(start)
    setDateRangeEnd(end)
  }

  const filterProps: FiltersSidebarProps = {
    availableRaceTypes,
    raceTypes,
    onRaceTypeToggle: toggleRaceType,
    raceTypeLabel,
    availableMonths,
    dateRangeStart,
    dateRangeEnd,
    onDateRangeChange,
    distanceRanges,
    onDistanceRangeToggle: toggleDistanceRange,
    distanceRangeOptions: DISTANCE_RANGES,
    timeLimitMin,
    onTimeLimitChange: setTimeLimitMin,
    costPrices,
    costMin,
    costMax,
    costGlobalMax,
    onCostRangeChange: handleCostRangeChange,
    poleFilter,
    onPoleFilterChange: setPoleFilter,
    entryStatus,
    onEntryStatusChange: setEntryStatus,
    showPastEvents,
    onShowPastEventsChange: setShowPastEvents,
    t,
    lang,
  }

  // Inject filters into sidebar via context (dependency on filter state to avoid infinite loop)
  const { setFilterNode } = useSidebarFilter()
  const filterDepsKey = JSON.stringify([
    [...raceTypes], dateRangeStart, dateRangeEnd,
    [...distanceRanges], timeLimitMin, costMin, costMax, poleFilter, entryStatus, showPastEvents,
    raceTypes.size, loading,
  ])
  useEffect(() => {
    setFilterNode(<SidebarFilters {...filterProps} />)
    return () => setFilterNode(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterDepsKey])

  const activeChips = getActiveFilterChips(filterProps)
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false)

  // Progressive rendering: show limited cards initially to reduce TBT
  const INITIAL_RENDER_COUNT = 20
  const LOAD_MORE_COUNT = 20
  const [visibleCount, setVisibleCount] = useState(INITIAL_RENDER_COUNT)

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(INITIAL_RENDER_COUNT)
  }, [raceTypes.size, dateRangeStart, dateRangeEnd, distanceRanges.size, timeLimitMin, costMin, costMax, poleFilter, entryStatus, showPastEvents])

  if (error) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 text-center">
        <p className="text-destructive">{isEn ? 'Error:' : 'エラー:'} {error}</p>
      </div>
    )
  }

  const isSingleRaceType = (type: string) => raceTypes.size === 1 && raceTypes.has(type)

  const pageTitle = isSingleRaceType('hyrox')
    ? (isEn ? 'HYROX Japan 2026 | Schedule, Venues & Travel from Tokyo — yabai.travel' : 'HYROX日本大会 2026 — スケジュール・会場・交通アクセス | yabai.travel')
    : (isEn ? 'Endurance Races Near Tokyo | yabai.travel' : 'トレラン・HYROX・スパルタン大会を探す | yabai.travel')

  const pageDescription = isSingleRaceType('hyrox')
    ? (isEn ? 'HYROX Japan race schedule, entry fees, and travel guide from Tokyo. Find venues in Chiba and more with access and accommodation costs.' : 'HYROX日本大会（千葉など）のスケジュール・参加費・東京からのアクセス・宿泊情報を一括確認。初心者から上級者まで対応。')
    : (isEn ? 'Search trail running, HYROX, Spartan and marathon races in Japan with travel costs from Tokyo. Day trip or overnight — all in one place.' : '東京起点の交通アクセス・宿泊コスト付きで、トレラン・HYROX・スパルタンレース・マラソン大会を検索。日帰り判定や宿泊必要性まで一括確認。39+ソースから自動収集。')

  return (
    <>
      <title>{pageTitle}</title>
      <meta name="description" content={pageDescription} />
      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={pageDescription} />
      <meta property="og:url" content={`https://yabai.travel/${lang || 'ja'}`} />
      <link rel="canonical" href={`https://yabai.travel${location.pathname}`} />
      <link rel="alternate" hrefLang="ja" href={`https://yabai.travel${location.pathname.replace(/^\/(ja|en)/, '/ja')}`} />
      <link rel="alternate" hrefLang="en" href={`https://yabai.travel${location.pathname.replace(/^\/(ja|en)/, '/en')}`} />
      <link rel="alternate" hrefLang="x-default" href={`https://yabai.travel${location.pathname.replace(/^\/(ja|en)/, '/en')}`} />

      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">

        {/* Crew Banner */}
        {!isEn && (
          <div className="mb-6 rounded-lg border border-primary/30 bg-primary/5 p-4 flex items-center justify-between">
            <div>
              <p className="font-semibold text-foreground">Crew ¥500/月</p>
              <p className="text-sm text-muted-foreground">
                レース詳細の無制限閲覧、お気に入り保存、掲示板コメント
              </p>
            </div>
            <Button asChild>
              <a href={`${langPrefix}/pricing`}>詳しく見る</a>
            </Button>
          </div>
        )}

        {/* Active filter chips + toolbar */}
        <div className="mb-4 space-y-2">
          {/* Active filter chips row */}
          <div className="flex items-center gap-2">
            {/* Mobile-only filter button */}
            <Sheet open={mobileFilterOpen} onOpenChange={setMobileFilterOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="shrink-0 min-[960px]:hidden">
                  <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
                  {lang === 'en' ? 'Filters' : '絞り込み'}
                  {activeChips.length > 0 && (
                    <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                      {activeChips.length}
                    </span>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 overflow-y-auto p-0">
                <SheetHeader className="px-4 pt-4">
                  <SheetTitle>{lang === 'en' ? 'Filters' : '絞り込み'}</SheetTitle>
                </SheetHeader>
                <div className="mt-2">
                  <SidebarFilters {...filterProps} />
                </div>
              </SheetContent>
            </Sheet>

            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              {activeChips.length === 0 && (
                <span className="text-sm text-muted-foreground hidden min-[960px]:inline">
                  {lang === 'en' ? 'No filters applied' : 'フィルターなし'}
                </span>
              )}
              {activeChips.map((chip) => (
                <Badge
                  key={chip.key}
                  variant="secondary"
                  className="flex items-center gap-1 pl-2 pr-1 py-0.5 text-xs"
                >
                  <span>{chip.label}</span>
                  <button
                    type="button"
                    onClick={chip.onRemove}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20 transition-colors"
                    aria-label={`Remove ${chip.label}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          {/* Result count + reset button + map toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {loading ? '...' : `${filtered.length} ${lang === 'en' ? 'events' : '件'}`}
              </span>
              {/* #2: Reset button - only show when any filter is active */}
              {hasAnyFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetAllFilters}
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="mr-1 h-3 w-3" />
                  {lang === 'en' ? 'Reset' : 'リセット'}
                </Button>
              )}
            </div>
            {/* #4: Map toggle - changed from ghost to outline for visibility */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowMap((prev) => !prev)}
              className="text-xs"
            >
              {showMap ? (
                <>
                  <MapPinOff className="mr-1 h-3.5 w-3.5" />
                  {lang === 'en' ? 'Hide Map' : '地図を非表示'}
                </>
              ) : (
                <>
                  <MapIcon className="mr-1 h-3.5 w-3.5" />
                  {lang === 'en' ? 'Show Map' : '地図を表示'}
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Map (toggle, max height 300px, lazy-loaded) */}
        {!loading && showMap && (
          <LazyLoadWrapper
            className="mb-6 max-h-[300px] overflow-hidden rounded-xl"
            minHeight="300px"
            rootMargin="100px"
            placeholder={
              <div className="flex h-[300px] items-center justify-center rounded-xl border border-border/40 bg-muted/30">
                <MapIcon className="h-8 w-8 animate-pulse text-muted-foreground/40" />
              </div>
            }
          >
            <Suspense fallback={
              <div className="flex h-[300px] items-center justify-center rounded-xl border border-border/40 bg-muted/30">
                <MapIcon className="h-8 w-8 animate-pulse text-muted-foreground/40" />
              </div>
            }>
              <EventMap events={filtered} langPrefix={langPrefix} raceTypeLabel={raceTypeLabel} lang={lang} />
            </Suspense>
          </LazyLoadWrapper>
        )}

        {/* Crew CTA */}
        {!isSupporter && (
          <div className="mb-6 rounded-lg border border-primary/30 bg-primary/5 p-4 text-center">
            <p className="font-medium">
              {isEn ? 'More with Crew' : 'Crew なら、もっと便利に'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {isEn
                ? 'Save favorites, join the discussion and more'
                : 'お気に入り保存・掲示板コメント等'}
            </p>
            <Link
              to={`${langPrefix}/pricing`}
              className="mt-3 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {isEn ? 'See Crew benefits for ¥500/mo' : '¥500/月で特典を確認'}
            </Link>
          </div>
        )}

        {/* Event Grid */}
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 min-h-[600px]">
            {Array.from({ length: 8 }).map((_, i) => (
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
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.slice(0, visibleCount).map((event) => {
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
            {filtered.length > visibleCount && (
              <div className="mt-6 flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => setVisibleCount((prev) => prev + LOAD_MORE_COUNT)}
                  className="px-8"
                >
                  {isEn
                    ? `Show more (${filtered.length - visibleCount} remaining)`
                    : `もっと見る（残り${filtered.length - visibleCount}件）`}
                </Button>
              </div>
            )}
          </>
        )}

      </div>
    </>
  )
}

export default EventList
