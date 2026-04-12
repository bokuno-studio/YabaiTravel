import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react'
import { useParams, useSearchParams, useLocation, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabaseClient'
import type { EventWithCategories } from '../types/event'
import LazyLoadWrapper from '../components/LazyLoadWrapper'
import { useAuth } from '@/lib/auth'
import { isAuthError, handleAuthError } from '@/lib/authErrorHandler'

const EventMap = lazy(() => import('../components/EventMap'))
import { EventCard } from '../components/EventCard'
import { EventCardSkeleton } from '../components/EventCardSkeleton'
import { FiltersSidebar } from '../components/FiltersSidebar'
import type { CountryOption, FiltersSidebarProps } from '../components/FiltersSidebar'
import { Button } from '@/components/ui/button'
import { MapIcon, MapPinOff, RotateCcw } from 'lucide-react'
import { useSidebarFilter } from '@/contexts/SidebarFilterContext'
import { useSidebarStats } from '@/contexts/SidebarStatsContext'
import { getFilterState, saveFilterState, resetFilterState } from '@/lib/filterStore'
import { useScrollDepth } from '@/hooks/useScrollDepth'

/** 距離レンジの定義（言語に応じてラベルを切り替え） */
function getDistanceRanges(isEn: boolean) {
  const sep = isEn ? '-' : '\u301C'
  return [
    { label: `${sep}10km`, min: 0, max: 10 },
    { label: `10${sep}30km`, min: 10, max: 30 },
    { label: `30km${sep}`, min: 30, max: Infinity },
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

function parseBooleanParam(searchParams: URLSearchParams, key: string, defaultValue: boolean): boolean {
  const value = searchParams.get(key)
  if (value == null) return defaultValue
  return value !== '0' && value !== 'false'
}

function getEventCountryLabel(event: EventWithCategories, isEn: boolean): string | null {
  return isEn ? (event.country_en ?? event.country) : event.country
}

const REGION_MAP: Record<string, string> = {
  '日本': 'アジア', '中国': 'アジア', '韓国': 'アジア', '台湾': 'アジア',
  'タイ': 'アジア', 'フィリピン': 'アジア', 'マレーシア': 'アジア',
  'インドネシア': 'アジア', 'ベトナム': 'アジア', 'シンガポール': 'アジア',
  'インド': 'アジア', 'ネパール': 'アジア', '香港': 'アジア',
  'フランス': 'ヨーロッパ', 'スペイン': 'ヨーロッパ', 'イタリア': 'ヨーロッパ',
  'スイス': 'ヨーロッパ', 'イギリス': 'ヨーロッパ', 'ドイツ': 'ヨーロッパ',
  'ギリシャ': 'ヨーロッパ', 'ポルトガル': 'ヨーロッパ', 'オーストリア': 'ヨーロッパ',
  'スウェーデン': 'ヨーロッパ', 'ノルウェー': 'ヨーロッパ', 'チェコ': 'ヨーロッパ',
  'クロアチア': 'ヨーロッパ', 'トルコ': 'ヨーロッパ', 'ポーランド': 'ヨーロッパ',
  'ハンガリー': 'ヨーロッパ', 'ルーマニア': 'ヨーロッパ', 'ブルガリア': 'ヨーロッパ',
  'オランダ': 'ヨーロッパ', 'ベルギー': 'ヨーロッパ', 'アイルランド': 'ヨーロッパ',
  'フィンランド': 'ヨーロッパ', 'デンマーク': 'ヨーロッパ',
  'アメリカ': 'アメリカ', 'カナダ': 'アメリカ', 'メキシコ': 'アメリカ',
  'ブラジル': 'アメリカ', 'アルゼンチン': 'アメリカ', 'チリ': 'アメリカ',
  'コロンビア': 'アメリカ', 'ペルー': 'アメリカ', 'コスタリカ': 'アメリカ',
  'オーストラリア': 'オセアニア', 'ニュージーランド': 'オセアニア',
  '南アフリカ': 'アフリカ', 'モロッコ': 'アフリカ', 'ケニア': 'アフリカ',
  'エジプト': 'アフリカ', 'タンザニア': 'アフリカ',
  'アラブ首長国連邦': '中東', 'イスラエル': '中東', 'ヨルダン': '中東',
  'オマーン': '中東', 'サウジアラビア': '中東',
  'Japan': 'Asia', 'China': 'Asia', 'South Korea': 'Asia', 'Taiwan': 'Asia',
  'Thailand': 'Asia', 'Philippines': 'Asia', 'Malaysia': 'Asia',
  'Indonesia': 'Asia', 'Vietnam': 'Asia', 'Singapore': 'Asia',
  'India': 'Asia', 'Nepal': 'Asia', 'Hong Kong': 'Asia',
  'France': 'Europe', 'Spain': 'Europe', 'Italy': 'Europe',
  'Switzerland': 'Europe', 'United Kingdom': 'Europe', 'Germany': 'Europe',
  'Greece': 'Europe', 'Portugal': 'Europe', 'Austria': 'Europe',
  'Sweden': 'Europe', 'Norway': 'Europe', 'Czech Republic': 'Europe',
  'Croatia': 'Europe', 'Turkey': 'Europe', 'Poland': 'Europe',
  'Hungary': 'Europe', 'Romania': 'Europe', 'Bulgaria': 'Europe',
  'Netherlands': 'Europe', 'Belgium': 'Europe', 'Ireland': 'Europe',
  'Finland': 'Europe', 'Denmark': 'Europe',
  'United States': 'Americas', 'Canada': 'Americas', 'Mexico': 'Americas',
  'Brazil': 'Americas', 'Argentina': 'Americas', 'Chile': 'Americas',
  'Colombia': 'Americas', 'Peru': 'Americas', 'Costa Rica': 'Americas',
  'Australia': 'Oceania', 'New Zealand': 'Oceania',
  'South Africa': 'Africa', 'Morocco': 'Africa', 'Kenya': 'Africa',
  'Egypt': 'Africa', 'Tanzania': 'Africa',
  'United Arab Emirates': 'Middle East', 'Israel': 'Middle East',
  'Jordan': 'Middle East', 'Oman': 'Middle East', 'Saudi Arabia': 'Middle East',
}

function getRegion(countryName: string, isEn: boolean): string {
  return REGION_MAP[countryName] ?? (isEn ? 'Other' : 'その他')
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
  const { isSupporter, loading: authLoading } = useAuth()
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
  const [countries, setCountries] = useState<Set<string>>(() => {
    const fromParams = parseSetParam(searchParams, 'countries')
    return fromParams.size > 0 ? fromParams : new Set(saved.countries)
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
  const [entryOpenOnly, setEntryOpenOnly] = useState<boolean>(() =>
    parseBooleanParam(searchParams, 'entryOpenOnly', saved.entryOpenOnly)
  )
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
      countries: [...countries],
      dateRangeStart,
      dateRangeEnd,
      distanceRanges: [...distanceRanges],
      entryOpenOnly,
    })
    const params = new URLSearchParams()
    if (raceTypes.size > 0) params.set('raceTypes', [...raceTypes].join(','))
    if (countries.size > 0) params.set('countries', [...countries].join(','))
    if (dateRangeStart) params.set('date_from', dateRangeStart)
    if (dateRangeEnd) params.set('date_to', dateRangeEnd)
    if (distanceRanges.size > 0) params.set('distances', [...distanceRanges].join(','))
    if (!entryOpenOnly) params.set('entryOpenOnly', '0')
    setSearchParams(params, { replace: true })
  }, [raceTypes, countries, dateRangeStart, dateRangeEnd, distanceRanges, entryOpenOnly, setSearchParams])

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
            .is('deleted_at', null)
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
        console.error('[EventList] 取得エラー:', e instanceof Error ? e.message : JSON.stringify(e))
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

  const availableCountries = useMemo<CountryOption[]>(() => {
    const countMap = new Map<string, number>()
    events.forEach((event) => {
      const country = getEventCountryLabel(event, isEn)
      if (!country) return
      countMap.set(country, (countMap.get(country) ?? 0) + 1)
    })
    return [...countMap.entries()]
      .map(([name, count]) => ({
        name,
        count,
        region: getRegion(name, isEn),
      }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count
        return a.name.localeCompare(b.name, isEn ? 'en' : 'ja')
      })
  }, [events, isEn])


  const toggleRaceType = (t: string) => {
    setRaceTypes((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  const toggleCountry = (country: string) => {
    setCountries((prev) => {
      const next = new Set(prev)
      if (next.has(country)) next.delete(country)
      else next.add(country)
      return next
    })
  }

  const toggleDistanceRange = (idx: number) => {
    setDistanceRanges((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const eventMatchesDistanceFilter = (event: EventWithCategories): boolean => {
    if (distanceRanges.size === 0) return true

    return (event.categories ?? []).some((category) => {
      if (category.distance_km == null) return false
      return [...distanceRanges].some((idx) => {
        const range = DISTANCE_RANGES[idx]
        return category.distance_km >= range.min && (range.max === Infinity || category.distance_km <= range.max)
      })
    })
  }

  const hasAnyFilter = raceTypes.size > 0
    || countries.size > 0
    || Boolean(dateRangeStart)
    || Boolean(dateRangeEnd)
    || distanceRanges.size > 0
    || !entryOpenOnly

  // #2: Reset all filters
  const resetAllFilters = useCallback(() => {
    setRaceTypes(new Set())
    setCountries(new Set())
    setDateRangeStart(null)
    setDateRangeEnd(null)
    setDistanceRanges(new Set())
    setEntryOpenOnly(true)
    resetFilterState()
  }, [])

  const filtered = events.filter((event) => {
    const today = new Date().toISOString().slice(0, 10)
    if (raceTypes.size > 0 && (event.race_type == null || !raceTypes.has(event.race_type))) return false
    if (countries.size > 0) {
      const country = getEventCountryLabel(event, isEn)
      if (!country || !countries.has(country)) return false
    }
    if ((dateRangeStart || dateRangeEnd) && event.event_date) {
      if (dateRangeStart && event.event_date < dateRangeStart) return false
      if (dateRangeEnd && event.event_date > dateRangeEnd) return false
    }
    if (entryOpenOnly && (!event.entry_start || !event.entry_end || event.entry_start > today || event.entry_end < today)) {
      return false
    }
    if (!eventMatchesDistanceFilter(event)) return false
    return true
  })

  const raceTypeLabel = (type: string | null) => {
    if (!type) return t('raceType.other')
    return t(`raceType.${type}`, type)
  }

  const onDateRangeChange = (start: string | null, end: string | null) => {
    setDateRangeStart(start)
    setDateRangeEnd(end)
  }

  const filterProps: FiltersSidebarProps = {
    availableCountries,
    countries,
    onCountryToggle: toggleCountry,
    availableRaceTypes,
    raceTypes,
    onRaceTypeToggle: toggleRaceType,
    raceTypeLabel,
    dateRangeStart,
    dateRangeEnd,
    onDateRangeChange,
    distanceRanges,
    onDistanceRangeToggle: toggleDistanceRange,
    distanceRangeOptions: DISTANCE_RANGES,
    entryOpenOnly,
    onEntryOpenOnlyChange: setEntryOpenOnly,
    t,
    lang,
  }

  // Inject filters into sidebar via context (dependency on filter state to avoid infinite loop)
  const { setFilterNode } = useSidebarFilter()
  const filterDepsKey = JSON.stringify([
    [...raceTypes], [...countries], dateRangeStart, dateRangeEnd,
    [...distanceRanges], entryOpenOnly, raceTypes.size, countries.size, loading,
  ])
  useEffect(() => {
    setFilterNode(<FiltersSidebar {...filterProps} />)
    return () => setFilterNode(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterDepsKey])

  // Progressive rendering: show limited cards initially to reduce TBT
  const INITIAL_RENDER_COUNT = 20
  const LOAD_MORE_COUNT = 20
  const [visibleCount, setVisibleCount] = useState(INITIAL_RENDER_COUNT)

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(INITIAL_RENDER_COUNT)
  }, [raceTypes.size, countries.size, dateRangeStart, dateRangeEnd, distanceRanges.size, entryOpenOnly])

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

        {/* Hero Section — /en only */}
        {isEn && (
          <div className="mb-8 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 px-6 py-8 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Find Your Next Endurance Race in Japan
            </h1>
            <p className="mt-3 text-base text-muted-foreground max-w-xl mx-auto">
              Race information + travel planning in one place. Tokyo-based access times, accommodation costs, and day-trip feasibility — all included.
            </p>
            <a
              href="#race-list"
              className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Explore Races ↓
            </a>

            {/* Value Props */}
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-background/60 px-4 py-3">
                <p className="font-semibold text-foreground">39+ Race Sources</p>
                <p className="text-sm text-muted-foreground">All endurance races in Japan, aggregated</p>
              </div>
              <div className="rounded-lg bg-background/60 px-4 py-3">
                <p className="font-semibold text-foreground">Tokyo-Based Access</p>
                <p className="text-sm text-muted-foreground">Travel time &amp; transport from Tokyo included</p>
              </div>
              <div className="rounded-lg bg-background/60 px-4 py-3">
                <p className="font-semibold text-foreground">Accommodation + Transport</p>
                <p className="text-sm text-muted-foreground">Plan your whole trip in one place</p>
              </div>
            </div>
          </div>
        )}

        {/* Getting Started Section — /en only */}
        {isEn && (
          <div className="mb-8 rounded-xl border border-border bg-background px-6 py-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">New to Japanese Endurance Racing?</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <a href="/en/blog/trail-running-near-tokyo-2026" className="rounded-lg border border-border bg-muted/40 px-4 py-3 hover:bg-muted/70 transition-colors">
                <p className="font-medium text-foreground text-sm">Trail Running Near Tokyo</p>
                <p className="text-xs text-muted-foreground mt-1">10 day-trip races from the city</p>
              </a>
              <a href="/en/blog/hyrox-japan-guide-en-2026" className="rounded-lg border border-border bg-muted/40 px-4 py-3 hover:bg-muted/70 transition-colors">
                <p className="font-medium text-foreground text-sm">HYROX Japan 2026</p>
                <p className="text-xs text-muted-foreground mt-1">Complete guide for international participants</p>
              </a>
              <a href="/en/blog/spartan-race-japan-guide-2026" className="rounded-lg border border-border bg-muted/40 px-4 py-3 hover:bg-muted/70 transition-colors">
                <p className="font-medium text-foreground text-sm">Spartan Race Japan 2026</p>
                <p className="text-xs text-muted-foreground mt-1">Venues, distances &amp; travel tips</p>
              </a>
              <a href="/en/blog/endurance-races-japan-2026" className="rounded-lg border border-border bg-muted/40 px-4 py-3 hover:bg-muted/70 transition-colors">
                <p className="font-medium text-foreground text-sm">Endurance Races in Japan</p>
                <p className="text-xs text-muted-foreground mt-1">The complete 2026 guide</p>
              </a>
            </div>
          </div>
        )}

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
        <div id="race-list" className="mb-4 space-y-2">
          <FiltersSidebar {...filterProps} />

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
        {!authLoading && !isSupporter && (
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
              {filtered.slice(0, visibleCount).map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  raceTypeLabel={raceTypeLabel}
                  t={t}
                  lang={lang}
                />
              ))}
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
