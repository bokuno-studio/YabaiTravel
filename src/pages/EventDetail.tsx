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
  if (!event) return <p className="event-detail-error">大会が見つかりません</p>

  const outbound = accessRoutes.find((r) => r.direction === 'outbound')
  const returnRoute = accessRoutes.find((r) => r.direction === 'return')

  return (
    <div className="event-detail-page">
      {/* 1. 基本情報（一番上）: 日程・レース名・場所・種類・規模 */}
      <header className="event-detail-header">
        <Link to="/" className="back-link">← 一覧に戻る</Link>
        <h1>{event.name}</h1>
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
            {event.race_type && (
              <>
                <dt>レース種別</dt>
                <dd>{event.race_type === 'trail' ? 'トレラン' : event.race_type === 'marathon' ? 'マラソン' : event.race_type === 'spartan' ? 'スパルタン' : event.race_type}</dd>
              </>
            )}
            {event.participant_count != null && (
              <>
                <dt>大会規模</dt>
                <dd>約{event.participant_count.toLocaleString()}人</dd>
              </>
            )}
          </dl>
        </div>
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
        {/* 2. カテゴリ別セクション: 各カテゴリのスペック */}
        {categories.length > 0 && (
          <>
            <h2 className="section-title">レーススペック（カテゴリ別）</h2>
            {categories.map((cat) => (
              <div key={cat.id} className="category-section" id={`category-${cat.name}`}>
                <h3 className="category-section-title">{cat.name}</h3>
                <div className="category-stats">
                  {cat.distance_km != null && (
                    <span className="category-stat">
                      <strong>距離</strong> {cat.distance_km}km
                    </span>
                  )}
                  {cat.elevation_gain != null && (
                    <span className="category-stat">
                      <strong>獲得標高</strong> {cat.elevation_gain}m
                    </span>
                  )}
                  {cat.time_limit && (
                    <span className="category-stat">
                      <strong>制限時間</strong> {formatInterval(cat.time_limit)}
                    </span>
                  )}
                  {cat.entry_fee != null && (
                    <span className="category-stat">
                      <strong>申込費</strong> {cat.entry_fee.toLocaleString()}円
                    </span>
                  )}
                </div>
                <dl className="event-detail-dl">
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
                  {formatCutoffTimes(cat.cutoff_times) && (
                    <>
                      <dt>カットオフタイム</dt>
                      <dd className="multi-line">{formatCutoffTimes(cat.cutoff_times)}</dd>
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
                </dl>
              </div>
            ))}
          </>
        )}

        {/* 3. 申込み */}
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

        {/* 4. 公共交通機関で行けるか */}
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

        {/* 5. 何日必要か */}
        {(event.stay_status || accommodations.length > 0) && (
          <>
            <h2 className="section-title">何日必要か</h2>
            <dl className="event-detail-dl">
              {event.stay_status && (
                <>
                  <dt>ステイタス</dt>
                  <dd>{stayStatusLabel(event.stay_status)}</dd>
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

        {/* 6. トータルコスト */}
        {(outbound?.cost_estimate || accommodations.some((a) => a.avg_cost_3star != null) || categories.some((c) => c.entry_fee != null)) && (
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
              {(() => {
                const fees = categories.filter((c) => c.entry_fee != null).map((c) => c.entry_fee!)
                if (fees.length === 0) return null
                return (
                  <>
                    <dt>申込費（最小）</dt>
                    <dd>{Math.min(...fees).toLocaleString()}円〜</dd>
                  </>
                )
              })()}
            </dl>
          </>
        )}

        {/* 7. コスト・アクセスの詳細 */}
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

export default EventDetail
