import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import type { Event } from '../types/event'
import '../App.css'
import './EventDetail.css'

function EventDetail() {
  const { id } = useParams<{ id: string }>()
  const [event, setEvent] = useState<Event | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    async function fetchEvent() {
      try {
        const { data, error: err } = await supabase
          .from('events')
          .select('*')
          .eq('id', id)
          .single()

        if (err) throw err
        setEvent(data)
      } catch (e) {
        setError(e instanceof Error ? e.message : '取得に失敗しました')
      } finally {
        setLoading(false)
      }
    }
    fetchEvent()
  }, [id])

  if (loading) return <p className="event-detail-loading">読み込み中...</p>
  if (error) return <p className="event-detail-error">エラー: {error}</p>
  if (!event) return <p className="event-detail-error">大会が見つかりません</p>

  return (
    <div className="event-detail-page">
      <header className="event-detail-header">
        <Link to="/" className="back-link">← 一覧に戻る</Link>
        <h1>{event.name}</h1>
        <p className="event-detail-meta">
          {event.event_date}
          {event.location && ` / ${event.location}`}
        </p>
      </header>

      <section className="event-detail-body">
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
          {event.race_type && (
            <>
              <dt>レース種別</dt>
              <dd>{event.race_type}</dd>
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
      </section>
    </div>
  )
}

export default EventDetail
