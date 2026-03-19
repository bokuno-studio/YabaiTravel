import { Link, useParams, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { Search, Heart, MessageSquare, Info, ChevronDown, Menu, X } from 'lucide-react'
import AuthButton from './AuthButton'

const SPORT_GUIDES = [
  { key: 'marathon', ja: 'マラソン', en: 'Marathon' },
  { key: 'trail', ja: 'トレイルランニング', en: 'Trail Running' },
  { key: 'triathlon', ja: 'トライアスロン', en: 'Triathlon' },
  { key: 'spartan', ja: 'スパルタンレース', en: 'Spartan Race' },
  { key: 'hyrox', ja: 'HYROX', en: 'HYROX' },
  { key: 'obstacle', ja: 'オブスタクルレース', en: 'OCR' },
  { key: 'cycling', ja: 'サイクリング', en: 'Cycling' },
  { key: 'duathlon', ja: 'デュアスロン', en: 'Duathlon' },
  { key: 'rogaining', ja: 'ロゲイニング', en: 'Rogaining' },
  { key: 'adventure', ja: 'アドベンチャーレース', en: 'Adventure Racing' },
]

const TOP_GUIDES_COUNT = 3

function SideMenuContent({
  lang,
  langPrefix,
  isEn,
  location,
  onNavigate,
}: {
  lang: string | undefined
  langPrefix: string
  isEn: boolean
  location: ReturnType<typeof useLocation>
  onNavigate: () => void
}) {
  const [guidesExpanded, setGuidesExpanded] = useState(false)

  const isActive = (path: string) => location.pathname === path || location.pathname === `${path}/`
  const isActiveIncludes = (segment: string) => location.pathname.includes(segment)

  return (
    <div className="flex h-full flex-col px-3 py-4">
      {/* Logo + Language Switcher */}
      <div className="flex items-center justify-between border-b border-border px-2 pb-3 mb-4">
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
      </div>

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
          {isEn ? 'Support Us' : '応援してください'}
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
          {isEn ? 'Community Board' : 'コミュニティ掲示板'}
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
      <nav className="hidden min-[960px]:fixed min-[960px]:inset-y-0 min-[960px]:left-0 min-[960px]:z-[1000] min-[960px]:block min-[960px]:w-60 min-[960px]:overflow-y-auto min-[960px]:border-r min-[960px]:border-border min-[960px]:bg-background">
        <SideMenuContent
          lang={lang}
          langPrefix={langPrefix}
          isEn={isEn}
          location={location}
          onNavigate={closeMobile}
        />
      </nav>

      {/* Mobile sidebar - slide in */}
      <nav
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
