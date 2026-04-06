import { useParams, Link } from 'react-router-dom'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { trackGuideRead, trackGuideSectionView } from '../lib/analytics'
import { useScrollDepth } from '@/hooks/useScrollDepth'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { ChevronDown } from 'lucide-react'
import '../App.css'

// --- Types ---

type GearInfo = {
  essential: string[]
  recommended: string[]
  budget: string
}

// New structured content types
type StructuredOverview = {
  summary: string
  highlights: string[]
}

type StructuredRules = {
  items: Array<{ label: string; value: string }>
  notes: string
}

type StructuredGettingStarted = {
  steps: Array<{ title: string; description: string }>
}

type StructuredRecommendedRace = {
  name: string
  location: string
  difficulty: string
  description: string
}

type StructuredCommonMistake = {
  mistake: string
  solution: string
}

type GuideContent = {
  overview: string | StructuredOverview
  rules: string | StructuredRules
  getting_started: string | StructuredGettingStarted
  recommended_races: string | StructuredRecommendedRace[]
  common_mistakes: string | StructuredCommonMistake[]
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
  bike: {
    ja: { title: 'バイク', body: 'エンデュランス系バイクには、ロードレース、クリテリウム、ヒルクライム、ロングライドなど多様なカテゴリがあります。' },
    en: { title: 'Bike', body: 'Endurance cycling includes road races, criteriums, hill climbs, long rides, and gravel races.' },
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
  endurance: {
    ja: { title: 'エンデュランスレース', body: 'エンデュランスレースは、長距離耐久系のレースの総称です。トレイルランニング、トライアスロン、ウルトラマラソン、HYROX、オブスタクルレース等が含まれます。' },
    en: { title: 'Endurance Racing', body: 'Endurance racing encompasses long-distance racing events including trail running, triathlon, ultramarathon, HYROX, obstacle course racing, and more.' },
  },
}

const SPORT_TITLES: Record<string, { ja: string; en: string }> = {
  marathon: { ja: 'マラソン', en: 'Marathon' },
  trail: { ja: 'トレイルランニング', en: 'Trail Running' },
  triathlon: { ja: 'トライアスロン', en: 'Triathlon' },
  spartan: { ja: 'スパルタンレース', en: 'Spartan Race' },
  hyrox: { ja: 'HYROX', en: 'HYROX' },
  obstacle: { ja: 'オブスタクルレース（OCR）', en: 'Obstacle Course Racing (OCR)' },
  bike: { ja: 'バイク', en: 'Bike' },
  duathlon: { ja: 'デュアスロン', en: 'Duathlon' },
  rogaining: { ja: 'ロゲイニング', en: 'Rogaining' },
  adventure: { ja: 'アドベンチャーレース', en: 'Adventure Racing' },
  endurance: { ja: 'エンデュランスレース', en: 'Endurance Racing' },
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

// --- Section icons ---

const SECTION_ICONS: Record<string, string> = {
  overview: '📖',
  rules: '📋',
  getting_started: '🚀',
  recommended_races: '🏆',
  common_mistakes: '⚠️',
  gear: '🎒',
  community: '👥',
}

// --- Section background colors ---

const SECTION_BG: Record<string, string> = {
  overview: 'bg-white',
  rules: 'bg-slate-50',
  getting_started: 'bg-white',
  recommended_races: 'bg-blue-50/30',
  common_mistakes: 'bg-amber-50/30',
  gear: 'bg-white',
  community: 'bg-slate-50',
}

// --- Shared section wrapper ---

function SectionWrapper({ id, icon, title, children, sectionKey, isOpen, onToggle }: {
  id: string; icon: string; title: string; children: React.ReactNode;
  sectionKey?: string; isOpen?: boolean; onToggle?: () => void
}) {
  const bg = sectionKey ? SECTION_BG[sectionKey] || 'bg-white' : 'bg-white'
  const collapsible = onToggle !== undefined && isOpen !== undefined

  return (
    <section id={id} className={`mb-8 rounded-xl border border-slate-200 ${bg} p-5 shadow-sm`}>
      <h3
        className={`flex items-center gap-2 text-lg font-semibold text-slate-800 ${collapsible ? 'cursor-pointer select-none' : 'mb-3'} ${collapsible && isOpen ? 'mb-3' : ''}`}
        onClick={collapsible ? onToggle : undefined}
        role={collapsible ? 'button' : undefined}
        aria-expanded={collapsible ? isOpen : undefined}
      >
        <span className="text-xl" aria-hidden="true">{icon}</span>
        <span className="flex-1">{title}</span>
        {collapsible && (
          <ChevronDown
            className={`h-5 w-5 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        )}
      </h3>
      {collapsible ? (isOpen && children) : children}
    </section>
  )
}

// --- Legacy text section (backward compat) ---

function LegacyTextSection({ title, content, sectionKey, id, isOpen, onToggle }: {
  title: string; content: string; sectionKey?: string; id?: string;
  isOpen?: boolean; onToggle?: () => void
}) {
  if (!content) return null
  const icon = sectionKey ? SECTION_ICONS[sectionKey] || '' : ''
  const paragraphs = content.split(/\n\n+/).filter(Boolean)
  return (
    <SectionWrapper id={id || ''} icon={icon} title={title} sectionKey={sectionKey} isOpen={isOpen} onToggle={onToggle}>
      {paragraphs.map((p, i) => (
        <p key={i} className="whitespace-pre-wrap leading-relaxed text-slate-600 text-[0.95rem]" style={{ margin: i < paragraphs.length - 1 ? '0 0 0.8rem 0' : 0 }}>
          {p}
        </p>
      ))}
    </SectionWrapper>
  )
}

// --- Structured section components ---

function OverviewSection({ data, title, isOpen, onToggle }: { data: StructuredOverview; title: string; isOpen?: boolean; onToggle?: () => void }) {
  return (
    <SectionWrapper id="section-overview" icon={SECTION_ICONS.overview} title={title} sectionKey="overview" isOpen={isOpen} onToggle={onToggle}>
      <p className="mb-4 whitespace-pre-wrap leading-relaxed text-slate-600 text-[0.95rem]">{data.summary}</p>
      {data.highlights && data.highlights.length > 0 && (
        <ul className="m-0 list-disc space-y-1 pl-5 text-slate-600 text-[0.9rem] leading-relaxed">
          {data.highlights.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      )}
    </SectionWrapper>
  )
}

function RulesSection({ data, title, isOpen, onToggle }: { data: StructuredRules; title: string; isOpen?: boolean; onToggle?: () => void }) {
  return (
    <SectionWrapper id="section-rules" icon={SECTION_ICONS.rules} title={title} sectionKey="rules" isOpen={isOpen} onToggle={onToggle}>
      {data.items && data.items.length > 0 && (
        <div className="mb-4 overflow-x-auto">
          <table className="w-full text-left text-[0.9rem]">
            <tbody>
              {data.items.map((item, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-slate-50' : 'bg-white'}>
                  <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-700">{item.label}</td>
                  <td className="px-3 py-2 text-slate-600">{item.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data.notes && (
        <p className="whitespace-pre-wrap leading-relaxed text-slate-500 text-[0.85rem] italic">{data.notes}</p>
      )}
    </SectionWrapper>
  )
}

function GettingStartedSection({ data, title, isOpen, onToggle }: { data: StructuredGettingStarted; title: string; isOpen?: boolean; onToggle?: () => void }) {
  return (
    <SectionWrapper id="section-getting_started" icon={SECTION_ICONS.getting_started} title={title} sectionKey="getting_started" isOpen={isOpen} onToggle={onToggle}>
      <ol className="m-0 list-none space-y-4 p-0">
        {data.steps.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
              {i + 1}
            </span>
            <div>
              <p className="mb-1 font-semibold text-slate-800 text-[0.95rem]">{step.title}</p>
              <p className="leading-relaxed text-slate-600 text-[0.9rem]">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </SectionWrapper>
  )
}

function RecommendedRacesSection({ data, title, isOpen, onToggle }: { data: StructuredRecommendedRace[]; title: string; isOpen?: boolean; onToggle?: () => void }) {
  return (
    <SectionWrapper id="section-recommended_races" icon={SECTION_ICONS.recommended_races} title={title} sectionKey="recommended_races" isOpen={isOpen} onToggle={onToggle}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {data.map((race, i) => (
          <Card key={i} className="py-4">
            <CardHeader className="pb-0">
              <CardTitle className="text-[0.95rem]">{race.name}</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-xs">{race.location}</Badge>
                <Badge variant="secondary" className="text-xs">{race.difficulty}</Badge>
              </div>
              <p className="text-[0.85rem] leading-relaxed text-slate-600">{race.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </SectionWrapper>
  )
}

function CommonMistakesSection({ data, title, isOpen, onToggle }: { data: StructuredCommonMistake[]; title: string; isOpen?: boolean; onToggle?: () => void }) {
  return (
    <SectionWrapper id="section-common_mistakes" icon={SECTION_ICONS.common_mistakes} title={title} sectionKey="common_mistakes" isOpen={isOpen} onToggle={onToggle}>
      <div className="space-y-4">
        {data.map((item, i) => (
          <Card key={i} className="border-amber-200 bg-amber-50/50 py-4">
            <CardContent className="pt-0">
              <p className="mb-2 font-semibold text-slate-800 text-[0.95rem]">{item.mistake}</p>
              <p className="leading-relaxed text-slate-600 text-[0.85rem]">{item.solution}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </SectionWrapper>
  )
}

function GearSection({ data, labels, isOpen, onToggle }: { data: GearInfo; labels: typeof SECTION_LABELS.ja; isOpen?: boolean; onToggle?: () => void }) {
  return (
    <SectionWrapper id="section-gear" icon={SECTION_ICONS.gear} title={labels.gear} sectionKey="gear" isOpen={isOpen} onToggle={onToggle}>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {data.essential?.length > 0 && (
          <div>
            <h4 className="mb-2 text-[0.95rem] font-semibold text-slate-700">{labels.gear_essential}</h4>
            <ul className="m-0 list-disc space-y-1 pl-5 text-slate-600 text-[0.9rem] leading-relaxed">
              {data.essential.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>
        )}

        {data.recommended?.length > 0 && (
          <div>
            <h4 className="mb-2 text-[0.95rem] font-semibold text-slate-700">{labels.gear_recommended}</h4>
            <ul className="m-0 list-disc space-y-1 pl-5 text-slate-600 text-[0.9rem] leading-relaxed">
              {data.recommended.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>
        )}
      </div>

      {data.budget && (
        <p className="mt-4 text-[0.9rem] text-slate-600">
          <strong>{labels.gear_budget}:</strong> {data.budget}
        </p>
      )}
    </SectionWrapper>
  )
}

function CommunitySection({ content, title, isOpen, onToggle }: { content: string; title: string; isOpen?: boolean; onToggle?: () => void }) {
  if (!content) return null
  const paragraphs = content.split(/\n\n+/).filter(Boolean)
  return (
    <SectionWrapper id="section-community" icon={SECTION_ICONS.community} title={title} sectionKey="community" isOpen={isOpen} onToggle={onToggle}>
      {paragraphs.map((p, i) => (
        <p key={i} className="whitespace-pre-wrap leading-relaxed text-slate-600 text-[0.95rem]" style={{ margin: i < paragraphs.length - 1 ? '0 0 0.8rem 0' : 0 }}>
          {p}
        </p>
      ))}
    </SectionWrapper>
  )
}

// --- Sub-component: Table of Contents ---

function GuideTOC({ labels, content, isEn, activeSection, onSectionClick }: {
  labels: typeof SECTION_LABELS.ja; content: GuideContent; isEn: boolean;
  activeSection?: string; onSectionClick?: (key: string) => void
}) {
  const sections = [
    { key: 'overview', label: labels.overview, has: !!content.overview },
    { key: 'rules', label: labels.rules, has: !!content.rules },
    { key: 'getting_started', label: labels.getting_started, has: !!content.getting_started },
    { key: 'recommended_races', label: labels.recommended_races, has: !!content.recommended_races },
    { key: 'common_mistakes', label: labels.common_mistakes, has: !!content.common_mistakes },
    { key: 'gear', label: labels.gear, has: !!content.gear },
    { key: 'community', label: labels.community, has: !!content.community },
  ].filter(s => s.has)

  if (sections.length < 3) return null

  return (
    <nav
      aria-label={isEn ? 'Table of contents' : '目次'}
      className="mb-8 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 lg:sticky lg:top-4"
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        {isEn ? 'Contents' : '目次'}
      </p>
      <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0">
        {sections.map(s => (
          <li key={s.key}>
            <a
              href={`#section-${s.key}`}
              className={`text-sm no-underline hover:underline ${activeSection === s.key ? 'font-bold text-blue-700' : 'text-blue-600'}`}
              onClick={(e) => {
                if (onSectionClick) {
                  onSectionClick(s.key)
                  // Ensure section is open before scrolling
                  setTimeout(() => {
                    const el = document.getElementById(`section-${s.key}`)
                    if (el) el.scrollIntoView({ behavior: 'smooth' })
                  }, 50)
                  e.preventDefault()
                }
              }}
            >
              <span aria-hidden="true">{SECTION_ICONS[s.key] || ''}</span> {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

// --- Content rendering logic (handles backward compatibility) ---

type AccordionProps = { isOpen: boolean; onToggle: () => void }

function renderOverview(content: GuideContent, labels: typeof SECTION_LABELS.ja, acc: AccordionProps) {
  if (typeof content.overview === 'string') {
    return <LegacyTextSection title={labels.overview} content={content.overview} sectionKey="overview" id="section-overview" isOpen={acc.isOpen} onToggle={acc.onToggle} />
  }
  return <OverviewSection data={content.overview} title={labels.overview} isOpen={acc.isOpen} onToggle={acc.onToggle} />
}

function renderRules(content: GuideContent, labels: typeof SECTION_LABELS.ja, acc: AccordionProps) {
  if (typeof content.rules === 'string') {
    return <LegacyTextSection title={labels.rules} content={content.rules} sectionKey="rules" id="section-rules" isOpen={acc.isOpen} onToggle={acc.onToggle} />
  }
  return <RulesSection data={content.rules} title={labels.rules} isOpen={acc.isOpen} onToggle={acc.onToggle} />
}

function renderGettingStarted(content: GuideContent, labels: typeof SECTION_LABELS.ja, acc: AccordionProps) {
  if (typeof content.getting_started === 'string') {
    return <LegacyTextSection title={labels.getting_started} content={content.getting_started} sectionKey="getting_started" id="section-getting_started" isOpen={acc.isOpen} onToggle={acc.onToggle} />
  }
  return <GettingStartedSection data={content.getting_started} title={labels.getting_started} isOpen={acc.isOpen} onToggle={acc.onToggle} />
}

function renderRecommendedRaces(content: GuideContent, labels: typeof SECTION_LABELS.ja, acc: AccordionProps) {
  if (typeof content.recommended_races === 'string') {
    return <LegacyTextSection title={labels.recommended_races} content={content.recommended_races} sectionKey="recommended_races" id="section-recommended_races" isOpen={acc.isOpen} onToggle={acc.onToggle} />
  }
  return <RecommendedRacesSection data={content.recommended_races} title={labels.recommended_races} isOpen={acc.isOpen} onToggle={acc.onToggle} />
}

function renderCommonMistakes(content: GuideContent, labels: typeof SECTION_LABELS.ja, acc: AccordionProps) {
  if (typeof content.common_mistakes === 'string') {
    return <LegacyTextSection title={labels.common_mistakes} content={content.common_mistakes} sectionKey="common_mistakes" id="section-common_mistakes" isOpen={acc.isOpen} onToggle={acc.onToggle} />
  }
  return <CommonMistakesSection data={content.common_mistakes} title={labels.common_mistakes} isOpen={acc.isOpen} onToggle={acc.onToggle} />
}

// --- Main component ---

function SportGuide() {
  const { lang, sport } = useParams<{ lang: string; sport: string }>()
  const langPrefix = `/${lang || 'ja'}`
  const isEn = lang === 'en'
  const labels = isEn ? SECTION_LABELS.en : SECTION_LABELS.ja

  useScrollDepth('guide')
  const [dbContent, setDbContent] = useState<GuideContent | null>(null)
  const [loading, setLoading] = useState(true)
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['overview']))
  const [activeSection, setActiveSection] = useState<string>('overview')

  const toggleSection = (key: string) => {
    setOpenSections(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleTocClick = (key: string) => {
    // Ensure section is open
    setOpenSections(prev => {
      const next = new Set(prev)
      next.add(key)
      return next
    })
    setActiveSection(key)
  }

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

  // GA4: guide_read tracking — fire once when guide content loads
  const guideReadFiredRef = useRef<string | null>(null)
  useEffect(() => {
    if (sport && !loading && dbContent && guideReadFiredRef.current !== `${sport}_${lang}`) {
      guideReadFiredRef.current = `${sport}_${lang}`
      trackGuideRead(sport, lang || 'ja')
    }
  }, [sport, lang, loading, dbContent])

  // GA4: guide_section_view — IntersectionObserver
  const sectionViewedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!sport) return
    sectionViewedRef.current = new Set()
    const sectionIds = ['overview', 'rules', 'getting_started', 'recommended_races', 'common_mistakes', 'gear', 'community']
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const sectionName = entry.target.id.replace('section-', '')
            if (!sectionViewedRef.current.has(sectionName)) {
              sectionViewedRef.current.add(sectionName)
              trackGuideSectionView(sport, sectionName)
            }
          }
        }
      },
      { threshold: 0.3 }
    )
    for (const id of sectionIds) {
      const el = document.getElementById(`section-${id}`)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [sport, lang, loading])

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
        <p className="text-slate-500">{isEn ? 'Loading...' : '読み込み中...'}</p>
      </div>
    )
  }

  // If DB content exists, show structured view
  if (dbContent) {
    const readingTimeMin = Math.max(1, Math.round(JSON.stringify(dbContent).length / 500))
    const otherGuides = Object.keys(SPORT_TITLES).filter(k => k !== sport).slice(0, 4)

    const accProps = (key: string): AccordionProps => ({
      isOpen: openSections.has(key),
      onToggle: () => toggleSection(key),
    })

    return (
      <div className="event-list-page">
        <title>{sportTitle} {isEn ? '- Sports Guide | yabai.travel' : '- スポーツガイド | yabai.travel'}</title>
        <meta name="description" content={isEn ? `${sportTitle} guide - gear, tips, and getting started.` : `${sportTitle}ガイド - 必要な装備・始め方・レース情報。`} />
        <header className="app-header">
          <h1><Link to={langPrefix} style={{ textDecoration: 'none', color: 'inherit' }}>yabai.travel</Link></h1>
          <p className="app-subtitle">{isEn ? 'Sports Guide' : 'スポーツガイド'}</p>
        </header>

        <article style={{ maxWidth: '720px' }}>
          <h2 className="mb-2 text-2xl font-bold">{sportTitle}</h2>

          {/* Reading time badge */}
          <p className="mb-6 text-sm text-slate-500">
            {isEn ? `\u{1F4D6} ~${readingTimeMin} min read` : `\u{1F4D6} \u7D04${readingTimeMin}\u5206\u3067\u8AAD\u3081\u308B`}
          </p>

          <GuideTOC labels={labels} content={dbContent} isEn={isEn} activeSection={activeSection} onSectionClick={handleTocClick} />

          {dbContent.overview && renderOverview(dbContent, labels, accProps('overview'))}
          {dbContent.rules && renderRules(dbContent, labels, accProps('rules'))}
          {dbContent.getting_started && renderGettingStarted(dbContent, labels, accProps('getting_started'))}
          {dbContent.recommended_races && renderRecommendedRaces(dbContent, labels, accProps('recommended_races'))}
          {dbContent.common_mistakes && renderCommonMistakes(dbContent, labels, accProps('common_mistakes'))}
          {dbContent.gear && <GearSection data={dbContent.gear} labels={labels} isOpen={openSections.has('gear')} onToggle={() => toggleSection('gear')} />}
          {dbContent.community && <CommunitySection content={dbContent.community} title={labels.community} isOpen={openSections.has('community')} onToggle={() => toggleSection('community')} />}

          {/* Search races CTA */}
          <div className="mt-10 text-center">
            <Button asChild size="lg" className="text-base px-8 py-6">
              <Link to={`${langPrefix}?type=${sport}`}>
                {isEn ? `Find ${sportTitle} races` : `${sportTitle}\u306E\u30EC\u30FC\u30B9\u3092\u63A2\u3059`}
              </Link>
            </Button>
          </div>

          {/* Related guides */}
          {otherGuides.length > 0 && (
            <div className="mt-12">
              <h3 className="mb-4 text-lg font-semibold text-slate-800">
                {isEn ? 'Other Sport Guides' : '\u4ED6\u306E\u30B9\u30DD\u30FC\u30C4\u30AC\u30A4\u30C9'}
              </h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {otherGuides.map(key => (
                  <Link
                    key={key}
                    to={`${langPrefix}/guide/${key}`}
                    className="rounded-lg border border-slate-200 bg-white p-3 text-center text-sm font-medium text-slate-700 no-underline shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50"
                  >
                    {isEn ? SPORT_TITLES[key].en : SPORT_TITLES[key].ja}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </article>

        {/* Comments */}
        {sport && (
          <div style={{ maxWidth: '720px', marginTop: '2rem' }}>
          </div>
        )}

        <p className="mt-8">
          <Link to={langPrefix} className="text-sm text-blue-600 no-underline hover:underline">
            {isEn ? 'Back to list' : '\u4E00\u89A7\u306B\u623B\u308B'}
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
        <h2 className="mb-4 text-2xl font-bold">{fallbackContent.title}</h2>
        <div className="whitespace-pre-wrap leading-relaxed text-slate-600 text-[0.95rem]">
          {fallbackContent.body}
        </div>

        {/* Search races CTA */}
        <div className="mt-10 text-center">
          <Button asChild size="lg" className="text-base px-8 py-6">
            <Link to={`${langPrefix}?type=${sport}`}>
              {isEn ? `Find ${fallbackContent.title} races` : `${fallbackContent.title}\u306E\u30EC\u30FC\u30B9\u3092\u63A2\u3059`}
            </Link>
          </Button>
        </div>

        {/* Related guides */}
        {(() => {
          const otherGuides = Object.keys(SPORT_TITLES).filter(k => k !== sport).slice(0, 4)
          return otherGuides.length > 0 ? (
            <div className="mt-12">
              <h3 className="mb-4 text-lg font-semibold text-slate-800">
                {isEn ? 'Other Sport Guides' : '\u4ED6\u306E\u30B9\u30DD\u30FC\u30C4\u30AC\u30A4\u30C9'}
              </h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {otherGuides.map(key => (
                  <Link
                    key={key}
                    to={`${langPrefix}/guide/${key}`}
                    className="rounded-lg border border-slate-200 bg-white p-3 text-center text-sm font-medium text-slate-700 no-underline shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50"
                  >
                    {isEn ? SPORT_TITLES[key].en : SPORT_TITLES[key].ja}
                  </Link>
                ))}
              </div>
            </div>
          ) : null
        })()}
      </article>

      {/* Comments */}
      {sport && (
        <div style={{ maxWidth: '720px', marginTop: '2rem' }}>
        </div>
      )}

      <p className="mt-8">
        <Link to={langPrefix} className="text-sm text-blue-600 no-underline hover:underline">
          {isEn ? 'Back to list' : '\u4E00\u89A7\u306B\u623B\u308B'}
        </Link>
      </p>
    </div>
  )
}

export default SportGuide
