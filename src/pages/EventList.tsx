import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import type { EventWithCategories, StayStatus, Category } from '../types/event'
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
  const [raceType, setRaceType] = useState<string>('all')
  const [month, setMonth] = useState<string>('')
  const [stayStatus, setStayStatus] = useState<string>('all')
  const [distanceMin, setDistanceMin] = useState<string>('')
  const [distanceMax, setDistanceMax] = useState<string>('')
  const [elevationMin, setElevationMin] = useState<string>('')
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

  const categoryMatchesFilter = (cat: Category): boolean => {
    const distMin = distanceMin ? parseFloat(distanceMin) : null
    const distMax = distanceMax ? parseFloat(distanceMax) : null
    const elevMin = elevationMin ? parseFloat(elevationMin) : null
    const timeMin = timeLimitMin ? parseFloat(timeLimitMin) : null

    if (distMin != null && (cat.distance_km == null || cat.distance_km < distMin)) return false
    if (distMax != null && (cat.distance_km == null || cat.distance_km > distMax)) return false
    if (elevMin != null && (cat.elevation_gain == null || cat.elevation_gain < elevMin)) return false
    if (timeMin != null) {
      const catHours = parseIntervalHours(cat.time_limit)
      if (catHours == null || catHours < timeMin) return false
    }
    return true
  }

  const filtered = events.filter((event) => {
    if (raceType !== 'all' && event.race_type !== raceType) return false
    if (stayStatus !== 'all' && event.stay_status !== stayStatus) return false
    if (month && event.event_date) {
      const [y, m] = month.split('-')
      if (!event.event_date.startsWith(`${y}-${m}`)) return false
    }
    const categories = event.categories ?? []
    const hasCategoryFilter = distanceMin || distanceMax || elevationMin || timeLimitMin
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
    }
    return map[t] ?? t
  }

  const stayStatusLabel = (s: StayStatus | null) => {
    if (!s) return null
    const map: Record<StayStatus, string> = {
      day_trip: '日帰り可能',
      pre_stay_required: '前泊必須',
      post_stay_recommended: '後泊推奨',
    }
    return map[s]
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
        <div className="filter-group">
          <label htmlFor="raceType">レース種別</label>
          <select
            id="raceType"
            value={raceType}
            onChange={(e) => setRaceType(e.target.value)}
          >
            <option value="all">すべて</option>
            <option value="marathon">マラソン</option>
            <option value="trail">トレラン</option>
            <option value="spartan">スパルタン</option>
            <option value="other">その他</option>
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="stayStatus">ステイタス</label>
          <select
            id="stayStatus"
            value={stayStatus}
            onChange={(e) => setStayStatus(e.target.value)}
          >
            <option value="all">すべて</option>
            <option value="day_trip">日帰り可能</option>
            <option value="pre_stay_required">前泊必須</option>
            <option value="post_stay_recommended">後泊推奨</option>
          </select>
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
          <label htmlFor="elevationMin">獲得標高（m）以上</label>
          <input
            id="elevationMin"
            type="number"
            min="0"
            step="100"
            placeholder="例: 2000"
            value={elevationMin}
            onChange={(e) => setElevationMin(e.target.value)}
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
                <Link to={`/events/${event.id}`} className="event-card-link">
                  <div className="event-main">
                    <h2>{event.name}</h2>
                    <p className="event-meta">
                      <span>{event.event_date}</span>
                      {event.location && <span> / {event.location}</span>}
                    </p>
                    {(event.categories ?? []).length > 0 && (
                      <div className="event-category-chips">
                        {(event.categories ?? []).map((cat) => (
                          <span
                            key={cat.id}
                            className="category-chip"
                            title={
                              cat.distance_km != null || cat.elevation_gain != null
                                ? `${cat.distance_km != null ? `${cat.distance_km}km` : ''} ${cat.elevation_gain != null ? `D+${cat.elevation_gain}m` : ''}`.trim()
                                : undefined
                            }
                          >
                            {cat.name}
                          </span>
                        ))}
                      </div>
                    )}
                    {entryPeriodText(event) && (
                      <p className="event-entry-period">申込: {entryPeriodText(event)}</p>
                    )}
                    {event.participant_count != null && (
                      <p className="event-scale">約{event.participant_count.toLocaleString()}人</p>
                    )}
                  </div>
                  <div className="event-card-badges">
                    {event.stay_status && (
                      <span className={`badge badge-stay badge-${event.stay_status}`}>
                        {stayStatusLabel(event.stay_status)}
                      </span>
                    )}
                    <span className={`badge badge-${event.race_type ?? 'other'}`}>
                      {raceTypeLabel(event.race_type)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export default EventList
