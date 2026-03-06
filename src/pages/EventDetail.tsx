import { useEffect, useState } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import type { Event, Category } from '../types/event'
import '../App.css'
import './EventDetail.css'

/**
 * 大会概要ページ: カテゴリ一覧を表示し、各カテゴリの詳細ページへリンク
 */
function EventDetail() {
  const { eventId } = useParams<{ eventId: string }>()
  const [event, setEvent] = useState<Event | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!eventId) return
    async function fetchData() {
      try {
        const [eventRes, catRes] = await Promise.all([
          supabase.from('events').select('*').eq('id', eventId).maybeSingle(),
          supabase.from('categories').select('*').eq('event_id', eventId).order('name'),
        ])

        if (eventRes.error) throw eventRes.error
        setEvent(eventRes.data ?? null)
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
  }, [eventId])

  if (loading) return <p className="event-detail-loading">読み込み中...</p>
  if (error) return <p className="event-detail-error">エラー: {error}</p>
  if (!event) return <p className="event-detail-error">大会が見つかりません</p>

  // カテゴリが1つのみの場合はその詳細へリダイレクト
  if (categories.length === 1 && eventId) {
    return <Navigate to={`/events/${eventId}/categories/${categories[0].id}`} replace />
  }

  return (
    <div className="event-detail-page">
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
