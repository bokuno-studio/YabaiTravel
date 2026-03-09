import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import type { Event, AccessRoute, Accommodation, Category, CourseMapFile, StayStatus } from '../types/event'
import '../App.css'
import './EventDetail.css'

function CategoryDetail() {
  const { eventId, categoryId } = useParams<{ eventId: string; categoryId: string }>()
  const [event, setEvent] = useState<Event | null>(null)
  const [category, setCategory] = useState<Category | null>(null)
  const [accessRoutes, setAccessRoutes] = useState<AccessRoute[]>([])
  const [accommodations, setAccommodations] = useState<Accommodation[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [courseMapFiles, setCourseMapFiles] = useState<CourseMapFile[]>([])
  const [pastEditions, setPastEditions] = useState<Array<{ event: Event; courseMaps: CourseMapFile[]; categories: Category[] }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!eventId || !categoryId) return
    async function fetchData() {
      try {
        const [eventRes, catRes, routesRes, accRes, allCatsRes, courseMapsRes] = await Promise.all([
          supabase.from('events').select('*').eq('id', eventId).maybeSingle(),
          supabase.from('categories').select('*').eq('id', categoryId).eq('event_id', eventId).maybeSingle(),
          supabase.from('access_routes').select('*').eq('event_id', eventId).order('direction'),
          supabase.from('accommodations').select('*').eq('event_id', eventId),
          supabase.from('categories').select('*').eq('event_id', eventId).order('name'),
          supabase.from('course_map_files').select('*').eq('event_id', eventId).order('year', { ascending: false }),
        ])

        if (eventRes.error) throw eventRes.error
        if (catRes.error) throw catRes.error
        const ev = eventRes.data ?? null
        setEvent(ev)
        setCategory(catRes.data ?? null)
        setAccessRoutes(routesRes.data ?? [])
        setAccommodations(accRes.data ?? [])
        setCategories(allCatsRes.data ?? [])
        setCourseMapFiles(courseMapsRes.data ?? [])

        // 同一シリーズの過去開催を取得（去年のコースマップ・料金・申込日参照用）
        if (ev?.event_series_id) {
          const pastRes = await supabase
            .from('events')
            .select('*')
            .eq('event_series_id', ev.event_series_id)
            .lt('event_date', ev.event_date)
            .order('event_date', { ascending: false })
            .limit(5)
          const pastEvents = pastRes.data ?? []
          const pastWithMaps: Array<{ event: Event; courseMaps: CourseMapFile[]; categories: Category[] }> = []
          for (const pe of pastEvents) {
            const [mapsRes, catsRes] = await Promise.all([
              supabase.from('course_map_files').select('*').eq('event_id', pe.id).order('year', { ascending: false }),
              supabase.from('categories').select('*').eq('event_id', pe.id).order('name'),
            ])
            pastWithMaps.push({
              event: pe as Event,
              courseMaps: mapsRes.data ?? [],
              categories: catsRes.data ?? [],
            })
          }
          setPastEditions(pastWithMaps)
        }
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
    }
    return map[t] ?? t
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

  /** 日付を 2024/11/5 形式で表示 */
  const formatDate = (d: string | null) => {
    if (!d) return null
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) return `${m[1]}/${parseInt(m[2], 10)}/${parseInt(m[3], 10)}`
    return d
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
            <dd>
              {event.event_date_end && event.event_date_end !== event.event_date
                ? `${event.event_date}〜${event.event_date_end}`
                : event.event_date}
            </dd>
            {event.location && (
              <>
                <dt>場所</dt>
                <dd>{event.location}</dd>
              </>
            )}
            {event.participant_count != null && (
              <>
                <dt>大会規模</dt>
                <dd>約{event.participant_count.toLocaleString()}人</dd>
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
              {raceTypeLabel(event.race_type)}
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

        {/* レーススペック（このカテゴリのみ。空欄も表示して視覚化 #30） */}
        <h2 className="section-title">レーススペック</h2>
        <dl className="event-detail-dl">
          <dt>スタート時間</dt>
          <dd className={category.start_time ? '' : 'empty-value'}>{category.start_time ? `${category.start_time} スタート` : '—'}</dd>
          <dt>受付終了</dt>
          <dd className={category.reception_end ? '' : 'empty-value'}>{category.reception_end ?? '—'}</dd>
          <dt>受付場所</dt>
          <dd className={category.reception_place || event.reception_place ? '' : 'empty-value'}>{category.reception_place ?? event.reception_place ?? '—'}</dd>
          <dt>スタート場所</dt>
          <dd className={category.start_place || event.start_place ? '' : 'empty-value'}>{category.start_place ?? event.start_place ?? '—'}</dd>
          <dt>完走率</dt>
          <dd className={category.finish_rate != null ? '' : 'empty-value'}>{category.finish_rate != null ? `${(category.finish_rate * 100).toFixed(1)}%` : '—'}</dd>
          <dt>カットオフタイム</dt>
          <dd className={formatCutoffTimes(category.cutoff_times) ? '' : 'empty-value multi-line'}>{formatCutoffTimes(category.cutoff_times) ?? '—'}</dd>
          <dt>必要ペース</dt>
          <dd className={category.required_pace ? '' : 'empty-value'}>{category.required_pace ?? '—'}</dd>
          <dt>必要クライムペース</dt>
          <dd className={category.required_climb_pace ? '' : 'empty-value'}>{category.required_climb_pace ?? '—'}</dd>
          <dt>必携品</dt>
          <dd className={category.mandatory_gear ? '' : 'empty-value multi-line'}>{category.mandatory_gear ?? '—'}</dd>
          <dt>携行推奨品</dt>
          <dd className={category.recommended_gear ? '' : 'empty-value multi-line'}>{category.recommended_gear ?? '—'}</dd>
          <dt>使用禁止品</dt>
          <dd className={category.prohibited_items ? '' : 'empty-value'}>{category.prohibited_items ?? '—'}</dd>
          <dt>ポール</dt>
          <dd className={category.poles_allowed != null ? '' : 'empty-value'}>{category.poles_allowed != null ? (category.poles_allowed ? '可' : '不可') : '—'}</dd>
          <dt>申込費</dt>
          <dd className={category.entry_fee != null ? '' : 'empty-value'}>{category.entry_fee != null ? `${category.entry_fee.toLocaleString()} ${category.entry_fee_currency ?? '円'}` : '—'}</dd>
        </dl>

        {/* 申込み（空欄も表示 #30） */}
        <h2 className="section-title">申込み</h2>
        <dl className="event-detail-dl">
          <dt>エントリ種別</dt>
          <dd className={event.entry_type ? '' : 'empty-value'}>
            {event.entry_type === 'lottery' ? '抽選' : event.entry_type === 'first_come' ? '先着' : event.entry_type ?? '—'}
          </dd>
          <dt>参加資格</dt>
          <dd className={event.required_qualification ? '' : 'empty-value'}>{event.required_qualification ?? '—'}</dd>
          <dt>ITRA</dt>
          <dd className={category.itra_points ? '' : 'empty-value'}>{category.itra_points ?? '—'}</dd>
          <dt>申込み開始</dt>
          <dd className={event.entry_start ? '' : 'empty-value'}>{event.entry_start ?? '—'}</dd>
          <dt>申込み終了</dt>
          <dd className={event.entry_end ? '' : 'empty-value'}>{event.entry_end ?? '—'}</dd>
          <dt>例年の申込期間</dt>
          <dd className={event.entry_start_typical ? '' : 'empty-value'}>
            {event.entry_start_typical && event.entry_end_typical ? (
              <>
                {formatDate(event.entry_start_typical)}〜{formatDate(event.entry_end_typical)}
                <span className="entry-typical-note">（今年の申込開始の目安）</span>
              </>
            ) : (
              '—'
            )}
          </dd>
        </dl>

        {/* 公共交通機関で行けるか（常に表示 #30） */}
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

        {/* 何日必要か（常に表示 #30） */}
        <h2 className="section-title">何日必要か</h2>
        <dl className="event-detail-dl">
          <dt>ステイタス</dt>
          <dd className={stayStatus ? '' : 'empty-value'}>{stayStatus ? stayStatusLabel(stayStatus) : '—'}</dd>
          <dt>前泊推奨地</dt>
          <dd className={accommodations.some((a) => a.recommended_area) ? '' : 'empty-value'}>
            {accommodations.some((a) => a.recommended_area)
              ? accommodations.map((a) => a.recommended_area).filter(Boolean).join('、')
              : '—'}
          </dd>
          <dt>宿泊費用目安（星3）</dt>
          <dd className={accommodations.some((a) => a.avg_cost_3star != null) ? '' : 'empty-value'}>
            {accommodations.some((a) => a.avg_cost_3star != null)
              ? `約${accommodations.find((a) => a.avg_cost_3star != null)?.avg_cost_3star?.toLocaleString()}円`
              : '—'}
          </dd>
        </dl>

        {/* トータルコスト（常に表示 #30） */}
        <h2 className="section-title">トータルコスト</h2>
        {event.total_cost_estimate && (
          <p className="total-cost-summary">{event.total_cost_estimate}</p>
        )}
        <dl className="event-detail-dl">
          <dt>申込費</dt>
          <dd className={category.entry_fee != null ? '' : 'empty-value'}>
            {category.entry_fee != null ? `${category.entry_fee.toLocaleString()} ${category.entry_fee_currency ?? '円'}` : '—'}
          </dd>
          <dt>往路交通費</dt>
          <dd className={outbound?.cost_estimate ? '' : 'empty-value'}>{outbound?.cost_estimate ?? '—'}</dd>
          <dt>復路交通費</dt>
          <dd className={returnRoute?.cost_estimate ? '' : 'empty-value'}>{returnRoute?.cost_estimate ?? '—'}</dd>
          <dt>宿泊</dt>
          <dd className={accommodations.some((a) => a.avg_cost_3star != null) ? '' : 'empty-value'}>
            {accommodations.some((a) => a.avg_cost_3star != null)
              ? `約${accommodations.find((a) => a.avg_cost_3star != null)?.avg_cost_3star?.toLocaleString()}円`
              : '—'}
          </dd>
        </dl>

        {/* アクセスの詳細（常に表示 #30） */}
        <h2 className="section-title">アクセスの詳細</h2>
        <h3 className="section-subtitle">往路</h3>
        <dl className="event-detail-dl">
          <dt>経路・乗り換え</dt>
          <dd className={outbound?.route_detail ? 'multi-line' : 'empty-value'}>{outbound?.route_detail ?? '—'}</dd>
          <dt>所要時間</dt>
          <dd className={outbound?.total_time_estimate ? '' : 'empty-value'}>{outbound?.total_time_estimate ?? '—'}</dd>
          <dt>費用概算</dt>
          <dd className={outbound?.cost_estimate ? '' : 'empty-value'}>{outbound?.cost_estimate ?? '—'}</dd>
          <dt>現金必須</dt>
          <dd className={outbound?.cash_required != null ? '' : 'empty-value'}>
            {outbound?.cash_required != null ? (outbound.cash_required ? 'あり' : 'なし') : '—'}
          </dd>
          <dt>予約サイト</dt>
          <dd className={outbound?.booking_url ? '' : 'empty-value'}>
            {outbound?.booking_url
              ? <a href={outbound.booking_url} target="_blank" rel="noreferrer">{outbound.booking_url}</a>
              : '—'}
          </dd>
          <dt>シャトルバス</dt>
          <dd className={outbound?.shuttle_available ? '' : 'empty-value'}>{outbound?.shuttle_available ?? '—'}</dd>
          <dt>タクシー</dt>
          <dd className={outbound?.taxi_estimate ? '' : 'empty-value'}>{outbound?.taxi_estimate ?? '—'}</dd>
        </dl>
        <h3 className="section-subtitle">復路</h3>
        <dl className="event-detail-dl">
          <dt>経路・乗り換え</dt>
          <dd className={returnRoute?.route_detail ? 'multi-line' : 'empty-value'}>{returnRoute?.route_detail ?? '—'}</dd>
          <dt>所要時間</dt>
          <dd className={returnRoute?.total_time_estimate ? '' : 'empty-value'}>{returnRoute?.total_time_estimate ?? '—'}</dd>
          <dt>費用概算</dt>
          <dd className={returnRoute?.cost_estimate ? '' : 'empty-value'}>{returnRoute?.cost_estimate ?? '—'}</dd>
        </dl>

        {/* コースマップ（サイト内保持・レース終了後も参照可能） */}
        {(courseMapFiles.length > 0 || event.course_map_url) && (
          <>
            <h2 className="section-title">コースマップ</h2>
            <dl className="event-detail-dl">
              {courseMapFiles.length > 0 ? (
                <>
                  <dt>サイト内保管</dt>
                  <dd>
                    <ul className="course-map-list">
                      {courseMapFiles.map((cm) => (
                        <li key={cm.id}>
                          <a href={cm.file_path} target="_blank" rel="noreferrer">
                            {cm.display_name ?? (cm.year ? `${cm.year}年コース` : 'コースマップ')}
                          </a>
                        </li>
                      ))}
                    </ul>
                    <p className="course-map-note">レース終了後も参照できます</p>
                  </dd>
                </>
              ) : event.course_map_url ? (
                <>
                  <dt>外部リンク</dt>
                  <dd>
                    <a href={event.course_map_url} target="_blank" rel="noreferrer">{event.course_map_url}</a>
                  </dd>
                </>
              ) : null}
            </dl>
          </>
        )}

        {/* 去年のレースはこちら（previous_edition_url） */}
        {event.previous_edition_url && (
          <>
            <h2 className="section-title">去年のレース</h2>
            <p>
              <a href={event.previous_edition_url} target="_blank" rel="noreferrer">
                去年のレースはこちら
              </a>
            </p>
          </>
        )}

        {/* 過去の開催（event_series 経由・去年のコースマップ・料金・申込日） */}
        {pastEditions.length > 0 && (
          <>
            <h2 className="section-title">過去の開催</h2>
            <p className="section-desc">去年のコースマップ・申込期間・料金の参考</p>
            <div className="past-editions">
              {pastEditions.map(({ event: pe, courseMaps, categories: pastCats }) => {
                const year = pe.event_date?.slice(0, 4)
                const sameCat = pastCats.find((c) => c.name === category?.name)
                return (
                  <div key={pe.id} className="past-edition-card">
                    <h3 className="past-edition-year">{year}年</h3>
                    <dl className="event-detail-dl">
                      {pe.entry_start_typical && (
                        <>
                          <dt>申込期間</dt>
                          <dd>{formatDate(pe.entry_start_typical)}〜{formatDate(pe.entry_end_typical)}</dd>
                        </>
                      )}
                      {sameCat?.entry_fee != null && (
                        <>
                          <dt>{sameCat.name} 申込費</dt>
                          <dd>{sameCat.entry_fee.toLocaleString()} {sameCat.entry_fee_currency ?? '円'}</dd>
                        </>
                      )}
                      {courseMaps.length > 0 && (
                        <>
                          <dt>コースマップ</dt>
                          <dd>
                            {courseMaps.map((cm) => (
                              <a key={cm.id} href={cm.file_path} target="_blank" rel="noreferrer" className="past-course-map-link">
                                {cm.display_name ?? `${cm.year}年`}
                              </a>
                            ))}
                          </dd>
                        </>
                      )}
                    </dl>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {(event.weather_forecast || event.weather_history != null || event.prohibited_items || event.furusato_nozei_url) && (
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
