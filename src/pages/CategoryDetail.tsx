import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import type { Event, AccessRoute, Accommodation, Category, StayStatus } from '../types/event'
import '../App.css'
import './EventDetail.css'

function CategoryDetail() {
  const { eventId, categoryId } = useParams<{ eventId: string; categoryId: string }>()
  const [event, setEvent] = useState<Event | null>(null)
  const [category, setCategory] = useState<Category | null>(null)
  const [accessRoutes, setAccessRoutes] = useState<AccessRoute[]>([])
  const [accommodations, setAccommodations] = useState<Accommodation[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!eventId || !categoryId) return
    async function fetchData() {
      try {
        const [eventRes, catRes, routesRes, accRes, allCatsRes] = await Promise.all([
          supabase.from('events').select('*').eq('id', eventId).single(),
          supabase.from('categories').select('*').eq('id', categoryId).eq('event_id', eventId).single(),
          supabase.from('access_routes').select('*').eq('event_id', eventId).order('direction'),
          supabase.from('accommodations').select('*').eq('event_id', eventId),
          supabase.from('categories').select('*').eq('event_id', eventId).order('name'),
        ])

        if (eventRes.error) throw eventRes.error
        if (catRes.error) throw catRes.error
        setEvent(eventRes.data)
        setCategory(catRes.data)
        setAccessRoutes(routesRes.data ?? [])
        setAccommodations(accRes.data ?? [])
        setCategories(allCatsRes.data ?? [])
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

  if (loading) return <p className="event-detail-loading">読み込み中...</p>
  if (error) return <p className="event-detail-error">エラー: {error}</p>
  if (!event || !category) return <p className="event-detail-error">見つかりません</p>

  const outbound = accessRoutes.find((r) => r.direction === 'outbound')
  const returnRoute = accessRoutes.find((r) => r.direction === 'return')
  const stayStatus = category.stay_status ?? event.stay_status

  return (
    <div className="event-detail-page">
      <header className="event-detail-header">
        <Link to="/" className="back-link">← 一覧に戻る</Link>
        <Link to={`/events/${eventId}`} className="back-link event-breadcrumb">
          {event.name}
        </Link>
        <h1>{event.name} — {category.name}</h1>
        <div className="event-detail-basic">
          <dl className="event-detail-dl event-detail-dl-inline">
            <dt>日程</dt>
            <dd>{event.event_date}</dd>
            {event.location && (
              <>
                <dt>場所</dt>
                <dd>{event.location}</dd>
              </>
            )}
            <dt>カテゴリ</dt>
            <dd>{category.name}</dd>
            {category.distance_km != null && (
              <>
                <dt>距離</dt>
                <dd>{category.distance_km}km</dd>
              </>
            )}
            {category.elevation_gain != null && (
              <>
                <dt>獲得標高</dt>
                <dd>{category.elevation_gain}m</dd>
              </>
            )}
            {category.time_limit && (
              <>
                <dt>制限時間</dt>
                <dd>{formatInterval(category.time_limit)}</dd>
              </>
            )}
          </dl>
        </div>
        <div className="event-detail-badges">
          {stayStatus && (
            <span className={`badge badge-stay badge-${stayStatus}`}>
              {stayStatusLabel(stayStatus)}
            </span>
          )}
          {event.race_type && (
            <span className={`badge badge-${event.race_type}`}>
              {event.race_type === 'trail' ? 'トレラン' : event.race_type === 'marathon' ? 'マラソン' : event.race_type === 'spartan' ? 'スパルタン' : event.race_type}
            </span>
          )}
        </div>
        {(event.official_url || event.entry_url) && (
          <div className="event-detail-links">
            {event.official_url && (
              <a href={event.official_url} target="_blank" rel="noreferrer">公式</a>
            )}
            {event.entry_url && (
              <a href={event.entry_url} target="_blank" rel="noreferrer">申込</a>
            )}
          </div>
        )}
      </header>

      <section className="event-detail-body">
        {/* 他カテゴリへのリンク */}
        {categories.length > 1 && (
          <div className="category-nav">
            {categories.map((c) => (
              <Link
                key={c.id}
                to={`/events/${eventId}/categories/${c.id}`}
                className={`category-nav-link ${c.id === categoryId ? 'active' : ''}`}
              >
                {c.name}
              </Link>
            ))}
          </div>
        )}

        {/* レーススペック（このカテゴリのみ） */}
        <h2 className="section-title">レーススペック</h2>
        <dl className="event-detail-dl">
          {category.start_time && (
            <>
              <dt>スタート時間</dt>
              <dd>{category.start_time} スタート</dd>
            </>
          )}
          {category.reception_end && (
            <>
              <dt>受付終了</dt>
              <dd>{category.reception_end}</dd>
            </>
          )}
          {category.reception_place && (
            <>
              <dt>受付場所</dt>
              <dd>{category.reception_place}</dd>
            </>
          )}
          {category.start_place && (
            <>
              <dt>スタート場所</dt>
              <dd>{category.start_place}</dd>
            </>
          )}
          {category.finish_rate != null && (
            <>
              <dt>完走率</dt>
              <dd>{(category.finish_rate * 100).toFixed(1)}%</dd>
            </>
          )}
          {formatCutoffTimes(category.cutoff_times) && (
            <>
              <dt>カットオフタイム</dt>
              <dd className="multi-line">{formatCutoffTimes(category.cutoff_times)}</dd>
            </>
          )}
          {category.required_pace && (
            <>
              <dt>必要ペース</dt>
              <dd>{category.required_pace}</dd>
            </>
          )}
          {category.required_climb_pace && (
            <>
              <dt>必要クライムペース</dt>
              <dd>{category.required_climb_pace}</dd>
            </>
          )}
          {category.mandatory_gear && (
            <>
              <dt>必携品</dt>
              <dd className="multi-line">{category.mandatory_gear}</dd>
            </>
          )}
          {category.recommended_gear && (
            <>
              <dt>携行推奨品</dt>
              <dd className="multi-line">{category.recommended_gear}</dd>
            </>
          )}
          {category.prohibited_items && (
            <>
              <dt>使用禁止品</dt>
              <dd>{category.prohibited_items}</dd>
            </>
          )}
          {category.poles_allowed != null && (
            <>
              <dt>ポール</dt>
              <dd>{category.poles_allowed ? '可' : '不可'}</dd>
            </>
          )}
          {category.entry_fee != null && (
            <>
              <dt>申込費</dt>
              <dd>{category.entry_fee.toLocaleString()}円</dd>
            </>
          )}
        </dl>

        {/* 申込み */}
        {(event.entry_start || event.entry_end || event.entry_start_typical || event.entry_end_typical) && (
          <>
            <h2 className="section-title">申込み</h2>
            <dl className="event-detail-dl">
              {event.entry_start && (
                <>
                  <dt>申込み開始</dt>
                  <dd>{event.entry_start}</dd>
                </>
              )}
              {event.entry_end && (
                <>
                  <dt>申込み終了</dt>
                  <dd>{event.entry_end}</dd>
                </>
              )}
              {event.entry_start_typical && (
                <>
                  <dt>例年</dt>
                  <dd>{event.entry_start_typical}〜{event.entry_end_typical}</dd>
                </>
              )}
            </dl>
          </>
        )}

        {/* 公共交通機関で行けるか */}
        {(outbound || returnRoute) && (
          <>
            <h2 className="section-title">公共交通機関で行けるか</h2>
            <div className="access-summary">
              {outbound && (
                <div className="access-summary-item">
                  <span className="access-summary-label">往路</span>
                  <span>{outbound.total_time_estimate}</span>
                  {outbound.cost_estimate && <span className="access-summary-cost">{outbound.cost_estimate}</span>}
                </div>
              )}
              {returnRoute && (
                <div className="access-summary-item">
                  <span className="access-summary-label">復路</span>
                  <span>{returnRoute.total_time_estimate}</span>
                  {returnRoute.cost_estimate && <span className="access-summary-cost">{returnRoute.cost_estimate}</span>}
                </div>
              )}
            </div>
          </>
        )}

        {/* 何日必要か（カテゴリの stay_status を優先） */}
        {(stayStatus || accommodations.length > 0) && (
          <>
            <h2 className="section-title">何日必要か</h2>
            <dl className="event-detail-dl">
              {stayStatus && (
                <>
                  <dt>ステイタス</dt>
                  <dd>{stayStatusLabel(stayStatus)}</dd>
                </>
              )}
              {accommodations.some((a) => a.recommended_area) && (
                <>
                  <dt>前泊推奨地</dt>
                  <dd>{accommodations.map((a) => a.recommended_area).filter(Boolean).join('、')}</dd>
                </>
              )}
              {accommodations.some((a) => a.avg_cost_3star != null) && (
                <>
                  <dt>宿泊費用目安（星3）</dt>
                  <dd>約{accommodations.find((a) => a.avg_cost_3star != null)?.avg_cost_3star?.toLocaleString()}円</dd>
                </>
              )}
            </dl>
          </>
        )}

        {/* トータルコスト */}
        {(outbound?.cost_estimate || returnRoute?.cost_estimate || accommodations.some((a) => a.avg_cost_3star != null) || category.entry_fee != null) && (
          <>
            <h2 className="section-title">トータルコスト</h2>
            <dl className="event-detail-dl">
              {outbound?.cost_estimate && (
                <>
                  <dt>往路交通費</dt>
                  <dd>{outbound.cost_estimate}</dd>
                </>
              )}
              {returnRoute?.cost_estimate && (
                <>
                  <dt>復路交通費</dt>
                  <dd>{returnRoute.cost_estimate}</dd>
                </>
              )}
              {accommodations.some((a) => a.avg_cost_3star != null) && (
                <>
                  <dt>宿泊</dt>
                  <dd>約{accommodations.find((a) => a.avg_cost_3star != null)?.avg_cost_3star?.toLocaleString()}円</dd>
                </>
              )}
              {category.entry_fee != null && (
                <>
                  <dt>申込費</dt>
                  <dd>{category.entry_fee.toLocaleString()}円</dd>
                </>
              )}
            </dl>
          </>
        )}

        {/* アクセスの詳細 */}
        {(outbound || returnRoute) && (
          <>
            <h2 className="section-title">アクセスの詳細</h2>
            {outbound && (
              <>
                <h3 className="section-subtitle">往路</h3>
                <dl className="event-detail-dl">
                  {outbound.route_detail && (
                    <>
                      <dt>経路・乗り換え</dt>
                      <dd className="multi-line">{outbound.route_detail}</dd>
                    </>
                  )}
                  {outbound.total_time_estimate && (
                    <>
                      <dt>所要時間</dt>
                      <dd>{outbound.total_time_estimate}</dd>
                    </>
                  )}
                  {outbound.cost_estimate && (
                    <>
                      <dt>費用概算</dt>
                      <dd>{outbound.cost_estimate}</dd>
                    </>
                  )}
                  {outbound.cash_required && (
                    <>
                      <dt>現金必須</dt>
                      <dd>あり</dd>
                    </>
                  )}
                  {outbound.booking_url && (
                    <>
                      <dt>予約サイト</dt>
                      <dd>
                        <a href={outbound.booking_url} target="_blank" rel="noreferrer">{outbound.booking_url}</a>
                      </dd>
                    </>
                  )}
                  {outbound.shuttle_available && (
                    <>
                      <dt>シャトルバス</dt>
                      <dd>{outbound.shuttle_available}</dd>
                    </>
                  )}
                  {outbound.taxi_estimate && (
                    <>
                      <dt>タクシー</dt>
                      <dd>{outbound.taxi_estimate}</dd>
                    </>
                  )}
                </dl>
              </>
            )}
            {returnRoute && (
              <>
                <h3 className="section-subtitle">復路</h3>
                <dl className="event-detail-dl">
                  {returnRoute.route_detail && (
                    <>
                      <dt>経路・乗り換え</dt>
                      <dd className="multi-line">{returnRoute.route_detail}</dd>
                    </>
                  )}
                  {returnRoute.total_time_estimate && (
                    <>
                      <dt>所要時間</dt>
                      <dd>{returnRoute.total_time_estimate}</dd>
                    </>
                  )}
                  {returnRoute.cost_estimate && (
                    <>
                      <dt>費用概算</dt>
                      <dd>{returnRoute.cost_estimate}</dd>
                    </>
                  )}
                </dl>
              </>
            )}
          </>
        )}

        {/* その他 */}
        {(event.weather_forecast || event.weather_history != null || event.course_map_url || event.prohibited_items || event.furusato_nozei_url) && (
          <>
            <h2 className="section-title">その他</h2>
            <dl className="event-detail-dl">
              {event.weather_forecast && (
                <>
                  <dt>天気予報</dt>
                  <dd>{event.weather_forecast}</dd>
                </>
              )}
              {event.weather_history != null && event.weather_history !== '' && (
                <>
                  <dt>例年の天気</dt>
                  <dd>{typeof event.weather_history === 'object' ? JSON.stringify(event.weather_history) : String(event.weather_history)}</dd>
                </>
              )}
              {event.course_map_url && (
                <>
                  <dt>コースマップ</dt>
                  <dd>
                    <a href={event.course_map_url} target="_blank" rel="noreferrer">{event.course_map_url}</a>
                  </dd>
                </>
              )}
              {event.prohibited_items && (
                <>
                  <dt>使用禁止品</dt>
                  <dd>{event.prohibited_items}</dd>
                </>
              )}
              {event.furusato_nozei_url && (
                <>
                  <dt>ふるさと納税</dt>
                  <dd>
                    <a href={event.furusato_nozei_url} target="_blank" rel="noreferrer">{event.furusato_nozei_url}</a>
                  </dd>
                </>
              )}
            </dl>
          </>
        )}
      </section>
    </div>
  )
}

export default CategoryDetail
