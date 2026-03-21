import { Link, useParams, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { Search, Heart, MessageSquare, Info, FileText, ChevronDown, Menu, X } from 'lucide-react'
import AuthButton from './AuthButton'
import { useSidebarFilter } from '@/contexts/SidebarFilterContext'
import { useSidebarStats } from '@/contexts/SidebarStatsContext'

const SPORT_GUIDES = [
  { key: 'marathon', ja: 'マラソン', en: 'Marathon' },
  { key: 'trail', ja: 'トレイルランニング', en: 'Trail Running' },
  { key: 'triathlon', ja: 'トライアスロン', en: 'Triathlon' },
  { key: 'spartan', ja: 'スパルタンレース', en: 'Spartan Race' },
  { key: 'hyrox', ja: 'HYROX', en: 'HYROX' },
  { key: 'obstacle', ja: 'オブスタクルレース', en: 'OCR' },
  { key: 'bike', ja: 'バイク', en: 'Bike' },
  { key: 'duathlon', ja: 'デュアスロン', en: 'Duathlon' },
  { key: 'rogaining', ja: 'ロゲイニング', en: 'Rogaining' },
  { key: 'adventure', ja: 'アドベンチャーレース', en: 'Adventure Racing' },
]

const TOP_GUIDES_COUNT = 3

/** Format timestamptz to JST display */
function formatJST(ts: string): string {
  return new Date(ts).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
}

function SideMenuContent({
  lang,
  langPrefix,
  isEn,
  location,
  onNavigate,
  filterNode,
  lastUpdated,
  weeklyNewCount,
}: {
  lang: string | undefined
  langPrefix: string
  isEn: boolean
  location: ReturnType<typeof useLocation>
  onNavigate: () => void
  filterNode?: React.ReactNode
  lastUpdated: string | null
  weeklyNewCount: number
}) {
  const [guidesExpanded, setGuidesExpanded] = useState(false)
  const [filtersCollapsed, setFiltersCollapsed] = useState(false) // #3: collapse/expand filters

  const isActive = (path: string) => location.pathname === path || location.pathname === `${path}/`
  const isActiveIncludes = (segment: string) => location.pathname.includes(segment)

  return (
    <div className="flex h-full flex-col px-3 py-4">
      {/* Logo + Language Switcher */}
      <div className="border-b border-border px-2 pb-3 mb-4">
        <div className="flex items-center justify-between">
          <Link
            to={langPrefix}
            className="text-base font-bold text-foreground no-underline hover:text-primary transition-colors"
            onClick={onNavigate}
          >
            yabai.travel
          </Link>
          <div className="flex gap-1">
            <Link
              to={`/ja${location.pathname.replace(/^\/(ja|en)/, '')}`}
              className={`px-2 py-0.5 rounded text-xs no-underline border transition-colors ${
                lang === 'ja'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'text-muted-foreground border-border hover:border-primary/50'
              }`}
            >
              JA
            </Link>
            <Link
              to={`/en${location.pathname.replace(/^\/(ja|en)/, '')}`}
              className={`px-2 py-0.5 rounded text-xs no-underline border transition-colors ${
                lang === 'en'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'text-muted-foreground border-border hover:border-primary/50'
              }`}
            >
              EN
            </Link>
          </div>
        </div>
        {/* #5: Last Updated under logo */}
        {lastUpdated && (
          <p className="mt-1.5 text-[10px] text-muted-foreground/70">
            {isEn ? 'Last updated' : '最終更新'}: {formatJST(lastUpdated)}
          </p>
        )}
      </div>

      {/* Main Action - Race Search */}
      <div className="space-y-1 mb-4">
        <Link
          to={langPrefix}
          className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium no-underline transition-colors ${
            isActive(langPrefix)
              ? 'bg-primary/10 text-primary'
              : 'text-foreground/70 hover:text-foreground hover:bg-muted'
          }`}
          onClick={onNavigate}
        >
          <Search className="h-4 w-4" />
          {isEn ? 'Race Search' : 'レース検索'}
        </Link>
        {/* #6: Weekly New count under Race Search */}
        {weeklyNewCount > 0 && (
          <p className="px-3 text-[10px] text-muted-foreground/70">
            {isEn ? `New this week: ${weeklyNewCount}` : `今週の新着: ${weeklyNewCount}件`}
          </p>
        )}
      </div>

      {/* Filter Section (injected from EventList, shown only on list page) */}
      {filterNode && (
        <>
          <div className="border-t border-border my-4" />
          {/* #3: Collapse/expand toggle */}
          <button
            type="button"
            onClick={() => setFiltersCollapsed(!filtersCollapsed)}
            aria-expanded={!filtersCollapsed}
            className="mb-1 px-3 text-xs text-muted-foreground hover:text-foreground transition-colors bg-transparent border-0 cursor-pointer text-left"
          >
            {filtersCollapsed
              ? (isEn ? 'Show filters' : '絞り込み条件を表示')
              : (isEn ? 'Collapse filters' : '絞り込み条件を畳む')
            }
          </button>
          {!filtersCollapsed && filterNode}
        </>
      )}

      {/* Separator */}
      <div className="border-t border-border my-4" />

      {/* Sports Guide */}
      <div className="mb-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 px-3">
          {isEn ? 'Sports Guide' : 'スポーツガイド'}
        </p>
        <div className="space-y-1">
          {SPORT_GUIDES.slice(0, guidesExpanded ? SPORT_GUIDES.length : TOP_GUIDES_COUNT).map((s) => (
            <Link
              key={s.key}
              to={`${langPrefix}/guide/${s.key}`}
              className={`block rounded-md px-3 py-1.5 text-sm no-underline transition-colors ${
                isActiveIncludes(`/guide/${s.key}`)
                  ? 'bg-primary/10 text-primary'
                  : 'text-foreground/70 hover:text-foreground hover:bg-muted'
              }`}
              onClick={onNavigate}
            >
              {isEn ? s.en : s.ja}
            </Link>
          ))}
          <button
            onClick={() => setGuidesExpanded(!guidesExpanded)}
            aria-expanded={guidesExpanded}
            className="flex items-center gap-1 w-full rounded-md px-3 py-1.5 text-sm text-primary hover:bg-primary/5 transition-colors border-0 bg-transparent cursor-pointer text-left"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${guidesExpanded ? 'rotate-180' : ''}`} />
            {guidesExpanded
              ? (isEn ? 'Close' : '閉じる')
              : (isEn ? 'Show all' : 'すべて表示')
            }
          </button>
        </div>
      </div>

      {/* Separator */}
      <div className="border-t border-border my-4" />

      {/* Support Section */}
      <div className="space-y-1">
        <Link
          to={`${langPrefix}/pricing`}
          className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm no-underline transition-colors ${
            isActiveIncludes('/pricing')
              ? 'bg-primary/10 text-primary'
              : 'text-foreground/70 hover:text-foreground hover:bg-muted'
          }`}
          onClick={onNavigate}
        >
          <Heart className="h-4 w-4" />
          {isEn ? 'Become Crew' : 'Crewになる'}
        </Link>
        <Link
          to={`${langPrefix}/feedback`}
          className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm no-underline transition-colors ${
            isActiveIncludes('/feedback')
              ? 'bg-primary/10 text-primary'
              : 'text-foreground/70 hover:text-foreground hover:bg-muted'
          }`}
          onClick={onNavigate}
        >
          <MessageSquare className="h-4 w-4" />
          {isEn ? 'Ideas' : 'みんなのアイデア'}
        </Link>
        <Link
          to={`${langPrefix}/sources`}
          className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm no-underline transition-colors ${
            isActiveIncludes('/sources')
              ? 'bg-primary/10 text-primary'
              : 'text-foreground/70 hover:text-foreground hover:bg-muted'
          }`}
          onClick={onNavigate}
        >
          <Info className="h-4 w-4" />
          {isEn ? 'Data Sources' : '情報取得元'}
        </Link>
        <Link
          to={`${langPrefix}/legal`}
          className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm no-underline transition-colors ${
            isActiveIncludes('/legal')
              ? 'bg-primary/10 text-primary'
              : 'text-foreground/70 hover:text-foreground hover:bg-muted'
          }`}
          onClick={onNavigate}
        >
          <FileText className="h-4 w-4" />
          {isEn ? 'Legal' : '特定商取引法'}
        </Link>
      </div>

      {/* Spacer to push auth to bottom */}
      <div className="flex-1" />

      {/* Auth */}
      <div className="border-t border-border pt-2">
        <AuthButton isEn={isEn} onNavigate={onNavigate} />
      </div>
    </div>
  )
}

function SideMenu() {
  const { lang } = useParams<{ lang: string }>()
  const location = useLocation()
  const langPrefix = `/${lang || 'ja'}`
  const isEn = lang === 'en'
  const [mobileOpen, setMobileOpen] = useState(false)
  const { filterNode } = useSidebarFilter()
  const { lastUpdated, weeklyNewCount } = useSidebarStats()

  const closeMobile = () => setMobileOpen(false)

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        className="fixed top-4 right-4 z-[1001] flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background shadow-sm text-foreground/70 hover:bg-muted cursor-pointer min-[960px]:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Menu"
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Desktop sidebar - always visible */}
      <nav role="navigation" aria-label="Main navigation" className="hidden min-[960px]:fixed min-[960px]:inset-y-0 min-[960px]:left-0 min-[960px]:z-[1000] min-[960px]:block min-[960px]:w-60 min-[960px]:overflow-y-auto min-[960px]:border-r min-[960px]:border-border min-[960px]:bg-background">
        <SideMenuContent
          lang={lang}
          langPrefix={langPrefix}
          isEn={isEn}
          location={location}
          onNavigate={closeMobile}
          filterNode={filterNode}
          lastUpdated={lastUpdated}
          weeklyNewCount={weeklyNewCount}
        />
      </nav>

      {/* Mobile sidebar - slide in */}
      <nav
        role="navigation"
        aria-label="Main navigation"
        className={`fixed inset-y-0 left-0 z-[1000] w-60 overflow-y-auto border-r border-border bg-background transition-transform duration-250 ease-in-out min-[960px]:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SideMenuContent
          lang={lang}
          langPrefix={langPrefix}
          isEn={isEn}
          location={location}
          onNavigate={closeMobile}
          filterNode={filterNode}
          lastUpdated={lastUpdated}
          weeklyNewCount={weeklyNewCount}
        />
      </nav>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[999] bg-black/20 min-[960px]:hidden"
          onClick={closeMobile}
        />
      )}
    </>
  )
}

export default SideMenu
