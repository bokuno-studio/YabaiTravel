import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import type { Event, AccessRoute, Accommodation, Category, StayStatus } from '../types/event'
import '../App.css'
import './EventDetail.css'

function EventDetail() {
  const { id } = useParams<{ id: string }>()
  const [event, setEvent] = useState<Event | null>(null)
  const [accessRoutes, setAccessRoutes] = useState<AccessRoute[]>([])
  const [accommodations, setAccommodations] = useState<Accommodation[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    async function fetchData() {
      try {
        const [eventRes, routesRes, accRes, catRes] = await Promise.all([
          supabase.from('events').select('*').eq('id', id).single(),
          supabase.from('access_routes').select('*').eq('event_id', id).order('direction'),
          supabase.from('accommodations').select('*').eq('event_id', id),
          supabase.from('categories').select('*').eq('event_id', id).order('name'),
        ])

        if (eventRes.error) throw eventRes.error
        setEvent(eventRes.data)
        setAccessRoutes(routesRes.data ?? [])
        setAccommodations(accRes.data ?? [])
        setCategories(catRes.data ?? [])
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.message
            : e && typeof e === 'object' && 'message' in e
              ? String((e as { message: unknown }).message)
              : String(e)
        console.error('[EventDetail] 取得エラー:', e)
        setError(msg || '取得に失敗しました')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [id])

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
    // PostgreSQL interval 例: "24:00:00" → "24時間"
    const m = v.match(/^(\d+):(\d+):(\d+)$/)
    if (m) {
      const h = parseInt(m[1], 10)
      const min = parseInt(m[2], 10)
      const parts = []
      if (h > 0) parts.push(`${h}時間`)
      if (min > 0) parts.push(`${min}分`)
      return parts.length ? parts.join('') : v
    }
    return v
  }

  if (loading) return <p className="event-detail-loading">読み込み中...</p>
  if (error) return <p className="event-detail-error">エラー: {error}</p>
  if (!event) return <p className="event-detail-error">大会が見つかりません</p>

  const outbound = accessRoutes.find((r) => r.direction === 'outbound')
  const returnRoute = accessRoutes.find((r) => r.direction === 'return')

  return (
    <div className="event-detail-page">
      <header className="event-detail-header">
        <Link to="/" className="back-link">← 一覧に戻る</Link>
        <h1>{event.name}</h1>
        <p className="event-detail-meta">
          {event.event_date}
          {event.location && ` / ${event.location}`}
        </p>
        <div className="event-detail-badges">
          {event.stay_status && (
            <span className={`badge badge-stay badge-${event.stay_status}`}>
              {stayStatusLabel(event.stay_status)}
            </span>
          )}
          {event.race_type && (
            <span className={`badge badge-${event.race_type}`}>
              {event.race_type === 'trail' ? 'トレラン' : event.race_type === 'marathon' ? 'マラソン' : event.race_type === 'spartan' ? 'スパルタン' : event.race_type}
            </span>
          )}
        </div>
      </header>

      <section className="event-detail-body">
        {/* 基本情報 */}
        <h2 className="section-title">基本情報</h2>
        <dl className="event-detail-dl">
          {event.official_url && (
            <>
              <dt>公式URL</dt>
              <dd>
                <a href={event.official_url} target="_blank" rel="noreferrer">
                  {event.official_url}
                </a>
              </dd>
            </>
          )}
          {event.entry_url && (
            <>
              <dt>申込みURL</dt>
              <dd>
                <a href={event.entry_url} target="_blank" rel="noreferrer">
                  {event.entry_url}
                </a>
              </dd>
            </>
          )}
          {event.participant_count != null && (
            <>
              <dt>大会規模</dt>
              <dd>約{event.participant_count.toLocaleString()}人</dd>
            </>
          )}
          {event.reception_place && (
            <>
              <dt>受付場所</dt>
              <dd>{event.reception_place}</dd>
            </>
          )}
          {event.start_place && (
            <>
              <dt>スタート場所</dt>
              <dd>{event.start_place}</dd>
            </>
          )}
        </dl>

        {/* 天気 */}
        {(event.weather_forecast || event.weather_history != null) && (
          <>
            <h2 className="section-title">天気</h2>
            <dl className="event-detail-dl">
              {event.weather_forecast && (
                <>
                  <dt>今年の天気予報</dt>
                  <dd>{event.weather_forecast}</dd>
                </>
              )}
              {event.weather_history != null && event.weather_history !== '' && (
                <>
                  <dt>例年の天気</dt>
                  <dd>{typeof event.weather_history === 'object' ? JSON.stringify(event.weather_history) : String(event.weather_history)}</dd>
                </>
              )}
            </dl>
          </>
        )}

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
                  <dt>例年の申込み開始</dt>
                  <dd>{event.entry_start_typical}</dd>
                </>
              )}
              {event.entry_end_typical && (
                <>
                  <dt>例年の申込み終了</dt>
                  <dd>{event.entry_end_typical}</dd>
                </>
              )}
            </dl>
          </>
        )}

        {/* 東京からのアクセス（往路） */}
        {outbound && (
          <>
            <h2 className="section-title">東京からのアクセス（往路）</h2>
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
                    <a href={outbound.booking_url} target="_blank" rel="noreferrer">
                      {outbound.booking_url}
                    </a>
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
            {accommodations.length > 0 && (
              <dl className="event-detail-dl">
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
            )}
          </>
        )}

        {/* 東京までのアクセス（復路） */}
        {returnRoute && (
          <>
            <h2 className="section-title">東京までのアクセス（復路）</h2>
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
            </dl>
          </>
        )}

        {/* その他 */}
        {(event.course_map_url || event.prohibited_items || event.furusato_nozei_url) && (
          <>
            <h2 className="section-title">その他</h2>
            <dl className="event-detail-dl">
              {event.course_map_url && (
                <>
                  <dt>コースマップ</dt>
                  <dd>
                    <a href={event.course_map_url} target="_blank" rel="noreferrer">
                      {event.course_map_url}
                    </a>
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
                    <a href={event.furusato_nozei_url} target="_blank" rel="noreferrer">
                      {event.furusato_nozei_url}
                    </a>
                  </dd>
                </>
              )}
            </dl>
          </>
        )}

        {/* カテゴリ */}
        {categories.length > 0 && (
          <>
            <h2 className="section-title">カテゴリ</h2>
            {categories.map((cat) => (
              <div key={cat.id} className="category-card">
                <h3 className="category-name">{cat.name}</h3>
                <dl className="event-detail-dl">
                  {cat.elevation_gain != null && (
                    <>
                      <dt>獲得標高</dt>
                      <dd>{cat.elevation_gain}m</dd>
                    </>
                  )}
                  {cat.start_time && (
                    <>
                      <dt>スタート時間</dt>
                      <dd>{cat.start_time}</dd>
                    </>
                  )}
                  {cat.reception_end && (
                    <>
                      <dt>受付終了</dt>
                      <dd>{cat.reception_end}</dd>
                    </>
                  )}
                  {cat.reception_place && (
                    <>
                      <dt>受付場所</dt>
                      <dd>{cat.reception_place}</dd>
                    </>
                  )}
                  {cat.start_place && (
                    <>
                      <dt>スタート場所</dt>
                      <dd>{cat.start_place}</dd>
                    </>
                  )}
                  {cat.finish_rate != null && (
                    <>
                      <dt>完走率</dt>
                      <dd>{(cat.finish_rate * 100).toFixed(1)}%</dd>
                    </>
                  )}
                  {cat.time_limit && (
                    <>
                      <dt>制限時間</dt>
                      <dd>{formatInterval(cat.time_limit)}</dd>
                    </>
                  )}
                  {cat.required_pace && (
                    <>
                      <dt>必要ペース</dt>
                      <dd>{cat.required_pace}</dd>
                    </>
                  )}
                  {cat.required_climb_pace && (
                    <>
                      <dt>必要クライムペース</dt>
                      <dd>{cat.required_climb_pace}</dd>
                    </>
                  )}
                  {cat.mandatory_gear && (
                    <>
                      <dt>必携品</dt>
                      <dd className="multi-line">{cat.mandatory_gear}</dd>
                    </>
                  )}
                  {cat.recommended_gear && (
                    <>
                      <dt>携行推奨品</dt>
                      <dd className="multi-line">{cat.recommended_gear}</dd>
                    </>
                  )}
                  {cat.prohibited_items && (
                    <>
                      <dt>使用禁止品</dt>
                      <dd>{cat.prohibited_items}</dd>
                    </>
                  )}
                  {cat.poles_allowed != null && (
                    <>
                      <dt>ポール</dt>
                      <dd>{cat.poles_allowed ? '可' : '不可'}</dd>
                    </>
                  )}
                  {cat.entry_fee != null && (
                    <>
                      <dt>申込み費用</dt>
                      <dd>{cat.entry_fee.toLocaleString()}円</dd>
                    </>
                  )}
                </dl>
              </div>
            ))}
          </>
        )}
      </section>
    </div>
  )
}

export default EventDetail
