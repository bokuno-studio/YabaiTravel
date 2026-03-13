import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import type { EventWithCategories, Category } from '../types/event'
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

function EventList() {
  const [events, setEvents] = useState<EventWithCategories[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [raceTypes, setRaceTypes] = useState<Set<string>>(new Set())
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())
  const [month, setMonth] = useState<string>('')
  const [distanceMin, setDistanceMin] = useState<string>('')
  const [distanceMax, setDistanceMax] = useState<string>('')
  const [timeLimitMin, setTimeLimitMin] = useState<string>('')
  const [entryStatus, setEntryStatus] = useState<string>('')
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
        .gte('created_at', weekAgo)
      setWeeklyNewCount(count ?? 0)
    }

    fetchEvents()
    fetchStats()
  }, [])

  /** DB に存在するレース種別を動的取得（#27） */
  const availableRaceTypes = useMemo(() => {
    const types = new Set<string>()
    events.forEach((e) => {
      if (e.race_type) types.add(e.race_type)
    })
    return [...types].sort()
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

  const categoryMatchesFilter = (cat: Category): boolean => {
    const distMin = distanceMin ? parseFloat(distanceMin) : null
    const distMax = distanceMax ? parseFloat(distanceMax) : null
    const timeMin = timeLimitMin ? parseFloat(timeLimitMin) : null

    if (distMin != null && (cat.distance_km == null || cat.distance_km < distMin)) return false
    if (distMax != null && (cat.distance_km == null || cat.distance_km > distMax)) return false
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

  const hasAnyFilter = raceTypes.size > 0 || selectedCategories.size > 0 || !!month || !!distanceMin || !!distanceMax || !!timeLimitMin || !!entryStatus

  const filtered = events.filter((event) => {
    if (raceTypes.size > 0 && (event.race_type == null || !raceTypes.has(event.race_type))) return false
    if (selectedCategories.size > 0) {
      const catNames = new Set((event.categories ?? []).map((c) => c.name))
      const hasMatch = [...selectedCategories].some((name) => catNames.has(name))
      if (!hasMatch) return false
    }
    if (month && event.event_date) {
      const [y, m] = month.split('-')
      if (!event.event_date.startsWith(`${y}-${m}`)) return false
    }
    if (entryStatus) {
      const today = new Date().toISOString().slice(0, 10)
      if (entryStatus === 'open') {
        if (!event.entry_start || !event.entry_end) return false
        if (event.entry_start > today || event.entry_end < today) return false
      } else if (entryStatus === 'upcoming') {
        if (!event.entry_start || event.entry_start <= today) return false
      } else if (entryStatus === 'closed') {
        if (!event.entry_end || event.entry_end >= today) return false
      }
    }
    const categories = event.categories ?? []
    const hasCategoryFilter = distanceMin || distanceMax || timeLimitMin
    if (hasCategoryFilter && categories.length > 0) {
      const hasMatch = categories.some(categoryMatchesFilter)
      if (!hasMatch) return false
    }
    return true
  })

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
      tough_mudder: 'タフマダー',
      triathlon: 'トライアスロン',
      aquathlon: 'アクアスロン',
    }
    return map[t] ?? t
  }

  const entryPeriodText = (e: EventWithCategories) => {
    if (e.entry_start && e.entry_end) return `${e.entry_start}〜${e.entry_end}`
    if (e.entry_start_typical && e.entry_end_typical) return `${e.entry_start_typical}〜${e.entry_end_typical}`
    return null
  }

  if (loading) return <p className="event-list-loading">読み込み中...</p>
  if (error) return <p className="event-list-error">エラー: {error}</p>

  return (
    <div className="event-list-page">
      <header className="app-header">
        <h1>
          <Link to="/">yabai.travel</Link>
        </h1>
        <p className="app-subtitle">エンデュランスレース一覧</p>
        <p className="app-stats">
          {lastUpdated && <span>最終更新: {formatJST(lastUpdated)}</span>}
          {weeklyNewCount > 0 && <span>今週の新着: {weeklyNewCount}件</span>}
        </p>
      </header>

      <section className="filters">
        <div className="filter-group filter-race-types">
          <label>レース種別</label>
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
            <label>カテゴリ</label>
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
        <div className="filter-group">
          <label htmlFor="month">開催月</label>
          <input
            id="month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label htmlFor="distanceMin">距離（km）以上</label>
          <input
            id="distanceMin"
            type="number"
            min="0"
            step="1"
            placeholder="例: 40"
            value={distanceMin}
            onChange={(e) => setDistanceMin(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label htmlFor="distanceMax">距離（km）以下</label>
          <input
            id="distanceMax"
            type="number"
            min="0"
            step="1"
            placeholder="例: 70"
            value={distanceMax}
            onChange={(e) => setDistanceMax(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label htmlFor="timeLimitMin">制限時間（h）以上</label>
          <select
            id="timeLimitMin"
            value={timeLimitMin}
            onChange={(e) => setTimeLimitMin(e.target.value)}
          >
            <option value="">指定なし</option>
            <option value="6">6時間以上</option>
            <option value="12">12時間以上</option>
            <option value="24">24時間以上</option>
            <option value="36">36時間以上</option>
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="entryStatus">エントリ状況</label>
          <select
            id="entryStatus"
            value={entryStatus}
            onChange={(e) => setEntryStatus(e.target.value)}
          >
            <option value="">指定なし</option>
            <option value="open">受付中</option>
            <option value="upcoming">申込前</option>
            <option value="closed">締切済</option>
          </select>
        </div>
      </section>

      <section className="event-list">
        {filtered.length === 0 ? (
          <p className="empty">条件に合う大会がありません。</p>
        ) : (
          <ul>
            {filtered.map((event) => {
              const matchingCats = getMatchingCategories(event)
              // フィルタで1件に絞られた場合は直接カテゴリへ、それ以外はイベント詳細へ (#33)
              const cardLink = hasAnyFilter && matchingCats.length === 1
                ? `/events/${event.id}/categories/${matchingCats[0].id}`
                : `/events/${event.id}`
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
                          <p className="event-entry-period">申込: {entryPeriodText(event)}</p>
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
                        <span className="badge badge-pending">詳細調査中</span>
                      </div>
                    </div>
                    )}
                    {isEnriched && chipsToShow.length > 0 && (
                      <div className="event-category-chips">
                        {chipsToShow.map((cat) => (
                          <Link
                            key={cat.id}
                            to={`/events/${event.id}/categories/${cat.id}`}
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
    </div>
  )
}

export default EventList
