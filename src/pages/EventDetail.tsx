import { useEffect, useState } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import type { Event, Category, AccessRoute, Accommodation } from '../types/event'
import '../App.css'
import './EventDetail.css'

/**
 * 大会概要ページ: カテゴリ一覧を表示し、各カテゴリの詳細ページへリンク
 * カテゴリ0件の場合はイベントレベルの情報（アクセス・申込み等）を直接表示 (#32)
 */
function EventDetail() {
  const { eventId } = useParams<{ eventId: string }>()
  const [event, setEvent] = useState<Event | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [accessRoutes, setAccessRoutes] = useState<AccessRoute[]>([])
  const [accommodations, setAccommodations] = useState<Accommodation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!eventId) return
    async function fetchData() {
      try {
        const [eventRes, catRes, routesRes, accRes] = await Promise.all([
          supabase.from('events').select('*').eq('id', eventId).maybeSingle(),
          supabase.from('categories').select('*').eq('event_id', eventId).order('name'),
          supabase.from('access_routes').select('*').eq('event_id', eventId).order('direction'),
          supabase.from('accommodations').select('*').eq('event_id', eventId),
        ])

        if (eventRes.error) throw eventRes.error
        setEvent(eventRes.data ?? null)
        setCategories(catRes.data ?? [])
        setAccessRoutes(routesRes.data ?? [])
        setAccommodations(accRes.data ?? [])
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
  }, [eventId])

  if (loading) return <p className="event-detail-loading">読み込み中...</p>
  if (error) return <p className="event-detail-error">エラー: {error}</p>
  if (!event) return <p className="event-detail-error">大会が見つかりません</p>

  // enrich未完了のイベントは一覧へリダイレクト (#63, #71)
  const hasEnrichedCategories = categories.length === 0 || categories.some(c => c.distance_km != null || c.elevation_gain != null)
  if (event.location == null || !hasEnrichedCategories) return <Navigate to="/" replace />

  // カテゴリが1つのみの場合はその詳細へリダイレクト
  if (categories.length === 1 && eventId) {
    return <Navigate to={`/events/${eventId}/categories/${categories[0].id}`} replace />
  }

  const outbound = accessRoutes.find((r) => r.direction === 'outbound')
  const returnRoute = accessRoutes.find((r) => r.direction === 'return')

  // カテゴリ0件: イベントレベルの情報を直接表示 (#32)
  if (categories.length === 0) {
    return (
      <div className="event-detail-page">
        <header className="event-detail-header">
          <Link to="/" className="back-link">← 一覧に戻る</Link>
          <h1>{event.name}</h1>
          {event.description && <p className="event-description">{event.description}</p>}
          <div className="event-detail-basic">
            <dl className="event-detail-dl event-detail-dl-inline">
              <dt>日程</dt>
              <dd>
                {event.event_date_end && event.event_date_end !== event.event_date
                  ? `${event.event_date}〜${event.event_date_end}`
                  : event.event_date ?? '—'}
              </dd>
              {event.location && (
                <>
                  <dt>場所</dt>
                  <dd>{event.location}</dd>
                </>
              )}
            </dl>
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
          <h2 className="section-title">申込み</h2>
          <dl className="event-detail-dl">
            <dt>エントリ種別</dt>
            <dd className={event.entry_type ? '' : 'empty-value'}>
              {event.entry_type === 'lottery' ? '抽選' : event.entry_type === 'first_come' ? '先着' : event.entry_type ?? '—'}
            </dd>
            <dt>参加資格</dt>
            <dd className={event.required_qualification ? '' : 'empty-value'}>{event.required_qualification ?? '—'}</dd>
            <dt>申込み開始</dt>
            <dd className={event.entry_start ? '' : 'empty-value'}>{event.entry_start ?? '—'}</dd>
            <dt>申込み終了</dt>
            <dd className={event.entry_end ? '' : 'empty-value'}>{event.entry_end ?? '—'}</dd>
          </dl>

          {(outbound || returnRoute) && (
            <>
              <h2 className="section-title">公共交通機関で行けるか</h2>
              {outbound?.transit_accessible != null && (
                <p className={`transit-accessible transit-accessible--${outbound.transit_accessible ? 'yes' : 'no'}`}>
                  {outbound.transit_accessible ? '✅ 公共交通機関で行ける' : '❌ 公共交通機関では行きにくい（要車・要シャトル）'}
                </p>
              )}
              <div className="access-summary">
                <div className="access-summary-item">
                  <span className="access-summary-label">往路</span>
                  <span className={outbound?.total_time_estimate ? '' : 'empty-value'}>{outbound?.total_time_estimate ?? '—'}</span>
                  {outbound?.cost_estimate && <span className="access-summary-cost">{outbound.cost_estimate}</span>}
                </div>
                <div className="access-summary-item">
                  <span className="access-summary-label">復路</span>
                  <span className={returnRoute?.total_time_estimate ? '' : 'empty-value'}>{returnRoute?.total_time_estimate ?? '—'}</span>
                  {returnRoute?.cost_estimate && <span className="access-summary-cost">{returnRoute.cost_estimate}</span>}
                </div>
              </div>
            </>
          )}

          {accommodations.length > 0 && (
            <>
              <h2 className="section-title">何日必要か</h2>
              <dl className="event-detail-dl">
                <dt>前泊推奨地</dt>
                <dd className={accommodations.some((a) => a.recommended_area) ? '' : 'empty-value'}>
                  {accommodations.map((a) => a.recommended_area).filter(Boolean).join('、') || '—'}
                </dd>
                <dt>宿泊費用目安（星3）</dt>
                <dd className={accommodations.some((a) => a.avg_cost_3star != null) ? '' : 'empty-value'}>
                  {accommodations.find((a) => a.avg_cost_3star != null)?.avg_cost_3star != null
                    ? `約${accommodations.find((a) => a.avg_cost_3star != null)?.avg_cost_3star?.toLocaleString()}円`
                    : '—'}
                </dd>
              </dl>
            </>
          )}
        </section>
      </div>
    )
  }

  return (
    <div className="event-detail-page">
      <header className="event-detail-header">
        <Link to="/" className="back-link">← 一覧に戻る</Link>
        <h1>{event.name}</h1>
        {event.description && <p className="event-description">{event.description}</p>}
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
          </dl>
        </div>
      </header>

      <section className="event-detail-body">
        <h2 className="section-title">カテゴリを選ぶ</h2>
        <p className="section-desc">調べたいカテゴリをクリックしてください</p>
        <ul className="category-list">
          {categories.map((cat) => (
            <li key={cat.id}>
              <Link
                to={`/events/${eventId}/categories/${cat.id}`}
                className="category-list-link"
              >
                <span className="category-list-name">{cat.name}</span>
                {(cat.distance_km != null || cat.elevation_gain != null) && (
                  <span className="category-list-spec">
                    {cat.distance_km != null && `${cat.distance_km}km`}
                    {cat.distance_km != null && cat.elevation_gain != null && ' / '}
                    {cat.elevation_gain != null && `D+${cat.elevation_gain}m`}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export default EventDetail
