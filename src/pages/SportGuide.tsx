import { useParams, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import EventComments from '@/components/EventComments'
import '../App.css'

// --- Types ---

type GearInfo = {
  essential: string[]
  recommended: string[]
  budget: string
}

type GuideContent = {
  overview: string
  rules: string
  getting_started: string
  recommended_races: string
  common_mistakes: string
  gear: GearInfo
  community: string
}

type SportGuideRow = {
  sport_key: string
  content_ja: GuideContent | null
  content_en: GuideContent | null
}

// --- Fallback hardcoded content (displayed when DB has no data) ---

const FALLBACK_GUIDES: Record<string, { ja: { title: string; body: string }; en: { title: string; body: string } }> = {
  marathon: {
    ja: { title: 'マラソン', body: 'マラソンはロード（舗装路）を走るランニング競技です。フルマラソン（42.195km）、ハーフマラソン（21.0975km）、10km、5km など様々な距離があります。' },
    en: { title: 'Marathon', body: 'Marathon is a road running event on paved surfaces. Distances range from 5K, 10K, Half Marathon to Full Marathon and beyond.' },
  },
  trail: {
    ja: { title: 'トレイルランニング', body: 'トレイルランニングは山や自然の中の未舗装路を走る競技です。' },
    en: { title: 'Trail Running', body: 'Trail running takes you off-road into mountains and nature.' },
  },
  triathlon: {
    ja: { title: 'トライアスロン', body: 'トライアスロンはスイム・バイク・ランの3種目を連続して行う複合競技です。' },
    en: { title: 'Triathlon', body: 'Triathlon combines swimming, cycling, and running in one continuous race.' },
  },
  spartan: {
    ja: { title: 'スパルタンレース', body: 'スパルタンレースは世界最大の障害物レース（OCR）シリーズです。' },
    en: { title: 'Spartan Race', body: 'Spartan Race is the world\'s largest obstacle course racing (OCR) series.' },
  },
  hyrox: {
    ja: { title: 'HYROX', body: 'HYROX は「フィットネスレース」として急成長中の競技です。' },
    en: { title: 'HYROX', body: 'HYROX is a fast-growing "fitness race" format.' },
  },
  obstacle: {
    ja: { title: 'オブスタクルレース（OCR）', body: 'OCR（Obstacle Course Racing）は、コース上の様々な障害物を乗り越えながらゴールを目指す競技の総称です。' },
    en: { title: 'Obstacle Course Racing (OCR)', body: 'OCR involves navigating various obstacles while running a course.' },
  },
  cycling: {
    ja: { title: 'サイクリング', body: 'エンデュランス系サイクリングには、ロードレース、クリテリウム、ヒルクライム、ロングライドなど多様なカテゴリがあります。' },
    en: { title: 'Cycling', body: 'Endurance cycling includes road races, criteriums, hill climbs, long rides, and gravel races.' },
  },
  duathlon: {
    ja: { title: 'デュアスロン', body: 'デュアスロンはラン→バイク→ランの3セグメントで構成される複合競技です。' },
    en: { title: 'Duathlon', body: 'Duathlon consists of Run, Bike, Run. It\'s multisport without the swim.' },
  },
  rogaining: {
    ja: { title: 'ロゲイニング', body: 'ロゲイニングは地図とコンパスを使い、制限時間内にチェックポイントを巡ってポイントを競うナビゲーションスポーツです。' },
    en: { title: 'Rogaining', body: 'Rogaining is a navigation sport using maps and compasses to visit checkpoints within a time limit.' },
  },
  adventure: {
    ja: { title: 'アドベンチャーレース', body: 'アドベンチャーレースはチーム制の長距離複合レースです。' },
    en: { title: 'Adventure Racing', body: 'Adventure racing is a team-based multidiscipline endurance event.' },
  },
}

const SPORT_TITLES: Record<string, { ja: string; en: string }> = {
  marathon: { ja: 'マラソン', en: 'Marathon' },
  trail: { ja: 'トレイルランニング', en: 'Trail Running' },
  triathlon: { ja: 'トライアスロン', en: 'Triathlon' },
  spartan: { ja: 'スパルタンレース', en: 'Spartan Race' },
  hyrox: { ja: 'HYROX', en: 'HYROX' },
  obstacle: { ja: 'オブスタクルレース（OCR）', en: 'Obstacle Course Racing (OCR)' },
  cycling: { ja: 'サイクリング', en: 'Cycling' },
  duathlon: { ja: 'デュアスロン', en: 'Duathlon' },
  rogaining: { ja: 'ロゲイニング', en: 'Rogaining' },
  adventure: { ja: 'アドベンチャーレース', en: 'Adventure Racing' },
}

// --- Section labels ---

const SECTION_LABELS = {
  ja: {
    overview: '概要',
    rules: 'ルール・形式',
    getting_started: '始め方',
    recommended_races: 'おすすめ入門大会',
    common_mistakes: 'よくある失敗と対策',
    gear: '必要な装備',
    gear_essential: '必須アイテム',
    gear_recommended: '推奨アイテム',
    gear_budget: '予算目安',
    community: 'コミュニティ',
  },
  en: {
    overview: 'Overview',
    rules: 'Rules & Format',
    getting_started: 'Getting Started',
    recommended_races: 'Recommended Races for Beginners',
    common_mistakes: 'Common Mistakes & Solutions',
    gear: 'Gear Guide',
    gear_essential: 'Essential Items',
    gear_recommended: 'Recommended Items',
    gear_budget: 'Budget Estimate',
    community: 'Community',
  },
}

// --- Sub-component: Section with title and pre-wrapped text ---

function GuideSection({ title, content }: { title: string; content: string }) {
  if (!content) return null
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem', color: '#1e293b' }}>{title}</h3>
      <p style={{ whiteSpace: 'pre-wrap', lineHeight: '1.8', color: '#334155', fontSize: '0.95rem', margin: 0 }}>
        {content}
      </p>
    </div>
  )
}

// --- Main component ---

function SportGuide() {
  const { lang, sport } = useParams<{ lang: string; sport: string }>()
  const langPrefix = `/${lang || 'ja'}`
  const isEn = lang === 'en'
  const labels = isEn ? SECTION_LABELS.en : SECTION_LABELS.ja

  const [dbContent, setDbContent] = useState<GuideContent | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!sport) {
      setLoading(false)
      return
    }
    setLoading(true)
    const fetchGuide = async () => {
      try {
        const { data } = await supabase
          .from('sport_guides')
          .select('content_ja, content_en')
          .eq('sport_key', sport)
          .single()
        const row = data as SportGuideRow | null
        if (row) {
          setDbContent(isEn ? row.content_en : row.content_ja)
        }
      } catch {
        // fallback to hardcoded content
      } finally {
        setLoading(false)
      }
    }
    fetchGuide()
  }, [sport, isEn])

  const fallback = sport ? FALLBACK_GUIDES[sport] : null
  const sportTitle = sport ? (isEn ? SPORT_TITLES[sport]?.en : SPORT_TITLES[sport]?.ja) ?? sport : ''

  // Not found
  if (!sport || (!fallback && !loading && !dbContent)) {
    return (
      <div className="event-list-page">
        <p>{isEn ? 'Guide not found.' : 'ガイドが見つかりません。'}</p>
        <Link to={langPrefix}>{isEn ? 'Back to list' : '一覧に戻る'}</Link>
      </div>
    )
  }

  // Loading state
  if (loading) {
    return (
      <div className="event-list-page">
        <header className="app-header">
          <h1><Link to={langPrefix} style={{ textDecoration: 'none', color: 'inherit' }}>yabai.travel</Link></h1>
          <p className="app-subtitle">{isEn ? 'Sports Guide' : 'スポーツガイド'}</p>
        </header>
        <p style={{ color: '#64748b' }}>{isEn ? 'Loading...' : '読み込み中...'}</p>
      </div>
    )
  }

  // If DB content exists, show structured view
  if (dbContent) {
    return (
      <div className="event-list-page">
        <title>{sportTitle} {isEn ? '- Sports Guide | yabai.travel' : '- スポーツガイド | yabai.travel'}</title>
        <meta name="description" content={isEn ? `${sportTitle} guide - gear, tips, and getting started.` : `${sportTitle}ガイド - 必要な装備・始め方・レース情報。`} />
        <header className="app-header">
          <h1><Link to={langPrefix} style={{ textDecoration: 'none', color: 'inherit' }}>yabai.travel</Link></h1>
          <p className="app-subtitle">{isEn ? 'Sports Guide' : 'スポーツガイド'}</p>
        </header>

        <article style={{ maxWidth: '720px' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>{sportTitle}</h2>

          <GuideSection title={labels.overview} content={dbContent.overview} />
          <GuideSection title={labels.rules} content={dbContent.rules} />
          <GuideSection title={labels.getting_started} content={dbContent.getting_started} />
          <GuideSection title={labels.recommended_races} content={dbContent.recommended_races} />
          <GuideSection title={labels.common_mistakes} content={dbContent.common_mistakes} />

          {/* Gear section */}
          {dbContent.gear && (
            <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem', color: '#1e293b' }}>{labels.gear}</h3>

              {dbContent.gear.essential?.length > 0 && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.4rem', color: '#334155' }}>{labels.gear_essential}</h4>
                  <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#475569', fontSize: '0.9rem', lineHeight: '1.7' }}>
                    {dbContent.gear.essential.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                </div>
              )}

              {dbContent.gear.recommended?.length > 0 && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.4rem', color: '#334155' }}>{labels.gear_recommended}</h4>
                  <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#475569', fontSize: '0.9rem', lineHeight: '1.7' }}>
                    {dbContent.gear.recommended.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                </div>
              )}

              {dbContent.gear.budget && (
                <p style={{ margin: 0, fontSize: '0.9rem', color: '#475569' }}>
                  <strong>{labels.gear_budget}:</strong> {dbContent.gear.budget}
                </p>
              )}
            </div>
          )}

          <GuideSection title={labels.community} content={dbContent.community} />

          {/* Link to events */}
          <div style={{ marginTop: '2rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>
              <Link to={`${langPrefix}?type=${sport}`} style={{ color: '#3b82f6', textDecoration: 'none' }}>
                {isEn ? `View ${sportTitle} events` : `${sportTitle}のレース一覧を見る`}
              </Link>
            </p>
          </div>
        </article>

        {/* Comments */}
        {sport && (
          <div style={{ maxWidth: '720px', marginTop: '2rem' }}>
            <EventComments raceType={sport} isEn={isEn} limit={5} />
          </div>
        )}

        <p style={{ marginTop: '2rem' }}>
          <Link to={langPrefix} style={{ color: '#3b82f6', textDecoration: 'none', fontSize: '0.9rem' }}>
            {isEn ? 'Back to list' : '一覧に戻る'}
          </Link>
        </p>
      </div>
    )
  }

  // Fallback: show hardcoded content
  const fallbackContent = fallback ? (isEn ? fallback.en : fallback.ja) : null
  if (!fallbackContent) {
    return (
      <div className="event-list-page">
        <p>{isEn ? 'Guide not found.' : 'ガイドが見つかりません。'}</p>
        <Link to={langPrefix}>{isEn ? 'Back to list' : '一覧に戻る'}</Link>
      </div>
    )
  }

  return (
    <div className="event-list-page">
      <title>{fallbackContent.title} {isEn ? '- Sports Guide | yabai.travel' : '- スポーツガイド | yabai.travel'}</title>
      <meta name="description" content={isEn ? `${fallbackContent.title} guide - gear, tips, and getting started.` : `${fallbackContent.title}ガイド - 必要な装備・始め方・レース情報。`} />
      <header className="app-header">
        <h1><Link to={langPrefix} style={{ textDecoration: 'none', color: 'inherit' }}>yabai.travel</Link></h1>
        <p className="app-subtitle">{isEn ? 'Sports Guide' : 'スポーツガイド'}</p>
      </header>

      <article style={{ maxWidth: '720px' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>{fallbackContent.title}</h2>
        <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.8', color: '#334155', fontSize: '0.95rem' }}>
          {fallbackContent.body}
        </div>

        <div style={{ marginTop: '2rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <p style={{ margin: 0, fontSize: '0.9rem' }}>
            <Link to={`${langPrefix}?type=${sport}`} style={{ color: '#3b82f6', textDecoration: 'none' }}>
              {isEn ? `View ${fallbackContent.title} events` : `${fallbackContent.title}のレース一覧を見る`}
            </Link>
          </p>
        </div>
      </article>

      {/* Comments */}
      {sport && (
        <div style={{ maxWidth: '720px', marginTop: '2rem' }}>
          <EventComments raceType={sport} isEn={isEn} limit={5} />
        </div>
      )}

      <p style={{ marginTop: '2rem' }}>
        <Link to={langPrefix} style={{ color: '#3b82f6', textDecoration: 'none', fontSize: '0.9rem' }}>
          {isEn ? 'Back to list' : '一覧に戻る'}
        </Link>
      </p>
    </div>
  )
}

export default SportGuide
