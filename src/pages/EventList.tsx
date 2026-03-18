import { useState, useEffect, useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Helmet } from 'react-helmet-async'
import { supabase } from '../lib/supabaseClient'
import type { EventWithCategories, Category } from '../types/event'
import EventMap from '../components/EventMap'
import PriceHistogramSlider from '../components/PriceHistogramSlider'
import '../App.css'
import './EventList.css'

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

/** 日付文字列に曜日を付与（例: "2026-05-16" → "2026-05-16（土）"） */
function formatDateWithDay(dateStr: string): string {
  const days = ['日', '月', '火', '水', '木', '金', '土']
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return dateStr
  return `${dateStr}（${days[d.getDay()]}）`
}

/** timestamptz を JST 表示に変換 */
function formatJST(ts: string): string {
  return new Date(ts).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
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

  /** コスト分布データ */
  const costPrices = useMemo(() => {
    return events
      .map((e) => e.total_cost_estimate ? parseInt(e.total_cost_estimate, 10) : NaN)
      .filter((v) => !isNaN(v) && v > 0)
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
    const filtered =
      raceTypes.size > 0
        ? events.filter((e) => e.race_type && raceTypes.has(e.race_type))
        : events
    const names = new Set<string>()
    filtered.forEach((e) => {
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
      if (event.total_cost_estimate) {
        const cost = parseInt(event.total_cost_estimate, 10)
        if (!isNaN(cost)) {
          if (cost < costMin || cost > costMax) return false
        }
      }
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
  const langPrefix = `/${lang || 'ja'}`

  const raceTypeLabel = (type: string | null) => {
    if (!type) return t('raceType.other')
    return t(`raceType.${type}`, type)
  }

  const entryPeriodText = (e: EventWithCategories) => {
    if (e.entry_start && e.entry_end) return `${e.entry_start}〜${e.entry_end}`
    if (e.entry_start_typical && e.entry_end_typical) return `${e.entry_start_typical}〜${e.entry_end_typical}`
    return null
  }

  if (loading) return <p className="event-list-loading">読み込み中...</p>
  if (error) return <p className="event-list-error">エラー: {error}</p>

  return (
    <>
      <Helmet>
        <title>エンデュランス大会を探す | yabai.travel</title>
        <meta name="description" content="トレラン・スパルタン・HYROX・マラソンなどエンデュランス系大会の情報、アクセス・宿泊コストをまとめて比較できるポータルサイト。" />
        <meta property="og:title" content="エンデュランス大会を探す | yabai.travel" />
        <meta property="og:description" content="トレラン・スパルタン・HYROX・マラソンなどエンデュランス系大会の情報、アクセス・宿泊コストをまとめて比較できるポータルサイト。" />
        <meta property="og:url" content="https://yabai-travel.vercel.app/ja" />
      </Helmet>
    <div className="event-list-page">
      <header className="app-header">
        <h1>
          <Link to={langPrefix}>{t('site.title')}</Link>
        </h1>
        <p className="app-subtitle">{t('site.subtitle')}</p>
        <p className="app-stats">
          {lastUpdated && <span>{t('stats.lastUpdated')}: {formatJST(lastUpdated)}</span>}
          {weeklyNewCount > 0 && <span>{t('stats.weeklyNew')}: {weeklyNewCount}</span>}
        </p>
      </header>

      <section className="filters">
        <div className="filter-group filter-race-types">
          <label>{t('filter.raceType')}</label>
          <div className="filter-checkboxes">
            {availableRaceTypes.map((t) => (
              <label key={t} className="filter-checkbox">
                <input
                  type="checkbox"
                  checked={raceTypes.has(t)}
                  onChange={() => toggleRaceType(t)}
                />
                <span>{raceTypeLabel(t)}</span>
              </label>
            ))}
          </div>
        </div>
        {availableCategories.length > 0 && (
          <div className="filter-group filter-categories">
            <label>{t('filter.category')}</label>
            <div className="filter-checkboxes filter-categories-inner">
              {availableCategories.slice(0, 20).map((name) => (
                <label key={name} className="filter-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedCategories.has(name)}
                    onChange={() => toggleCategory(name)}
                  />
                  <span>{name}</span>
                </label>
              ))}
              {availableCategories.length > 20 && (
                <span className="filter-more">他{availableCategories.length - 20}件</span>
              )}
            </div>
          </div>
        )}
        <div className="filter-group filter-months">
          <label>{t('filter.month')}</label>
          <div className="filter-chips">
            {availableMonths.map((ym) => {
              const m = parseInt(ym.slice(5, 7), 10)
              return (
                <button
                  key={ym}
                  type="button"
                  className={`filter-chip${selectedMonths.has(ym) ? ' filter-chip--active' : ''}`}
                  onClick={() => toggleMonth(ym)}
                >
                  {m}月
                </button>
              )
            })}
          </div>
        </div>
        <div className="filter-group filter-distance">
          <label>{t('filter.distance')}</label>
          <div className="filter-chips">
            {DISTANCE_RANGES.map((range, idx) => (
              <button
                key={idx}
                type="button"
                className={`filter-chip${distanceRanges.has(idx) ? ' filter-chip--active' : ''}`}
                onClick={() => toggleDistanceRange(idx)}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-group">
          <label htmlFor="timeLimitMin">{t('filter.timeLimit')}</label>
          <select
            id="timeLimitMin"
            value={timeLimitMin}
            onChange={(e) => setTimeLimitMin(e.target.value)}
          >
            <option value="">{t('filter.noLimit')}</option>
            <option value="6">{t('filter.hoursOrMore', { hours: 6 })}</option>
            <option value="12">{t('filter.hoursOrMore', { hours: 12 })}</option>
            <option value="24">{t('filter.hoursOrMore', { hours: 24 })}</option>
            <option value="36">{t('filter.hoursOrMore', { hours: 36 })}</option>
          </select>
        </div>
        <div className="filter-group">
          <label>{lang === 'en' ? 'Est. Cost' : 'コスト目安'}</label>
          <PriceHistogramSlider
            prices={costPrices}
            min={costMin}
            max={costMax >= Infinity ? costGlobalMax : costMax}
            onRangeChange={(newMin, newMax) => {
              setCostMin(newMin)
              setCostMax(newMax >= costGlobalMax ? Infinity : newMax)
            }}
            currency={lang === 'en' ? '$' : '¥'}
          />
        </div>
        <div className="filter-group">
          <label htmlFor="entryStatus">{t('filter.entryStatus')}</label>
          <select
            id="entryStatus"
            value={entryStatus}
            onChange={(e) => setEntryStatus(e.target.value)}
          >
            <option value="active">{t('filter.entryActive')}</option>
            <option value="open">{t('filter.entryOpen')}</option>
            <option value="upcoming">{t('filter.entryUpcoming')}</option>
            <option value="closed">{t('filter.entryClosed')}</option>
            <option value="">{t('filter.entryAll')}</option>
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={showPastEvents}
              onChange={(e) => setShowPastEvents(e.target.checked)}
            />
            <span>{t('filter.showPast')}</span>
          </label>
        </div>
      </section>

      <EventMap events={filtered} langPrefix={langPrefix} raceTypeLabel={raceTypeLabel} />

      <section className="event-list">
        {filtered.length === 0 ? (
          <p className="empty">{t('event.empty')}</p>
        ) : (
          <ul>
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
                <li key={event.id} className={`event-card${isEnriched ? '' : ' event-card--pending'}`}>
                  <div className="event-card-inner">
                    {isEnriched ? (
                    <Link to={cardLink} className="event-card-main">
                      <div className="event-main">
                        <h2>{event.name}</h2>
                        <p className="event-meta">
                          <span>
                            {event.event_date_end && event.event_date && event.event_date_end !== event.event_date
                              ? `${formatDateWithDay(event.event_date)}〜${formatDateWithDay(event.event_date_end)}`
                              : event.event_date ? formatDateWithDay(event.event_date) : null}
                          </span>
                          {event.country && <span> / {event.country}</span>}
                          {event.location && <span> / {event.location}</span>}
                        </p>
                        {entryPeriodText(event) && (
                          <p className="event-entry-period">{t('event.entry')}: {entryPeriodText(event)}</p>
                        )}
                        {event.total_cost_estimate && (
                          <p className="event-entry-period">{lang === 'en' ? 'Est.' : '目安'}: ¥{parseInt(event.total_cost_estimate, 10).toLocaleString()}</p>
                        )}
                      </div>
                      <div className="event-card-badges">
                        <span className={`badge badge-${event.race_type ?? 'other'}`}>
                          {raceTypeLabel(event.race_type)}
                        </span>
                      </div>
                    </Link>
                    ) : (
                    <div className="event-card-main event-card-main--disabled">
                      <div className="event-main">
                        <h2>{event.name}</h2>
                        <p className="event-meta">
                          <span>
                            {event.event_date_end && event.event_date && event.event_date_end !== event.event_date
                              ? `${formatDateWithDay(event.event_date)}〜${formatDateWithDay(event.event_date_end)}`
                              : event.event_date ? formatDateWithDay(event.event_date) : null}
                          </span>
                          {event.country && <span> / {event.country}</span>}
                        </p>
                      </div>
                      <div className="event-card-badges">
                        <span className={`badge badge-${event.race_type ?? 'other'}`}>
                          {raceTypeLabel(event.race_type)}
                        </span>
                        <span className="badge badge-pending">{t('event.pending')}</span>
                      </div>
                    </div>
                    )}
                    {isEnriched && chipsToShow.length > 0 && (
                      <div className="event-category-chips">
                        {chipsToShow.map((cat) => (
                          <Link
                            key={cat.id}
                            to={`${langPrefix}/events/${event.id}/categories/${cat.id}`}
                            className="category-chip"
                            title={
                              cat.distance_km != null || cat.elevation_gain != null
                                ? `${cat.distance_km != null ? `${cat.distance_km}km` : ''} ${cat.elevation_gain != null ? `D+${cat.elevation_gain}m` : ''}`.trim()
                                : undefined
                            }
                          >
                            {cat.name}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <footer className="app-footer">
        <Link to={`${langPrefix}/sources`}>{lang === 'en' ? 'Data Sources' : '情報取得元'}</Link>
      </footer>
    </div>
    </>
  )
}

export default EventList
