import { useState, useEffect } from 'react'
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

function EventList() {
  const [events, setEvents] = useState<EventWithCategories[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [raceTypes, setRaceTypes] = useState<Set<string>>(new Set())
  const [month, setMonth] = useState<string>('')
  const [distanceMin, setDistanceMin] = useState<string>('')
  const [distanceMax, setDistanceMax] = useState<string>('')
  const [timeLimitMin, setTimeLimitMin] = useState<string>('')

  useEffect(() => {
    async function fetchEvents() {
      try {
        const { data, error: err } = await supabase
          .from('events')
          .select('*, categories(*)')
          .order('event_date', { ascending: true })

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
    fetchEvents()
  }, [])

  const toggleRaceType = (t: string) => {
    setRaceTypes((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
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

  const filtered = events.filter((event) => {
    if (raceTypes.size > 0 && (event.race_type == null || !raceTypes.has(event.race_type))) return false
    if (month && event.event_date) {
      const [y, m] = month.split('-')
      if (!event.event_date.startsWith(`${y}-${m}`)) return false
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
      </header>

      <section className="filters">
        <div className="filter-group filter-race-types">
          <label>レース種別</label>
          <div className="filter-checkboxes">
            {['marathon', 'trail', 'spartan', 'adventure', 'other'].map((t) => (
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
      </section>

      <section className="event-list">
        {filtered.length === 0 ? (
          <p className="empty">条件に合う大会がありません。</p>
        ) : (
          <ul>
            {filtered.map((event) => (
              <li key={event.id} className="event-card">
                <div className="event-card-inner">
                  <Link to={`/events/${event.id}`} className="event-card-main">
                    <div className="event-main">
                      <h2>{event.name}</h2>
                    <p className="event-meta">
                      <span>{event.event_date}</span>
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
                {(event.categories ?? []).length > 0 && (
                  <div className="event-category-chips">
                    {(event.categories ?? []).map((cat) => (
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
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export default EventList
