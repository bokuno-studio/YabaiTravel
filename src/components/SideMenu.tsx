import { Link, useParams, useLocation } from 'react-router-dom'
import { useState } from 'react'
import './SideMenu.css'

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

function SideMenu() {
  const { lang } = useParams<{ lang: string }>()
  const location = useLocation()
  const langPrefix = `/${lang || 'ja'}`
  const isEn = lang === 'en'
  const [mobileOpen, setMobileOpen] = useState(false)
  const [guidesOpen, setGuidesOpen] = useState(location.pathname.includes('/guide/'))

  const menu = (
    <nav className={`side-menu${mobileOpen ? ' side-menu--open' : ''}`}>
      <Link to={langPrefix} className="side-menu-brand" onClick={() => setMobileOpen(false)}>
        yabai.travel
      </Link>

      <div className="side-menu-section">
        <ul>
          <li>
            <Link
              to={langPrefix}
              className={location.pathname === langPrefix || location.pathname === `${langPrefix}/` ? 'active' : ''}
              onClick={() => setMobileOpen(false)}
            >
              {isEn ? 'Race Search' : 'レース検索'}
            </Link>
          </li>
        </ul>
      </div>

      <div className="side-menu-section">
        <button className="side-menu-accordion" onClick={() => setGuidesOpen(!guidesOpen)}>
          <span className={`side-menu-accordion-arrow${guidesOpen ? ' side-menu-accordion-arrow--open' : ''}`}>▶</span>
          {isEn ? 'Sports Guide' : 'スポーツガイド'}
        </button>
        <ul className={`side-menu-accordion-content${guidesOpen ? ' side-menu-accordion-content--open' : ''}`}>
          {SPORT_GUIDES.map((s) => (
            <li key={s.key}>
              <Link
                to={`${langPrefix}/guide/${s.key}`}
                className={location.pathname.includes(`/guide/${s.key}`) ? 'active' : ''}
                onClick={() => setMobileOpen(false)}
              >
                {isEn ? s.en : s.ja}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="side-menu-section">
        <h3>{isEn ? 'Others' : 'その他'}</h3>
        <ul>
          <li>
            <Link
              to={`${langPrefix}/sources`}
              className={location.pathname.includes('/sources') ? 'active' : ''}
              onClick={() => setMobileOpen(false)}
            >
              {isEn ? 'Data Sources' : '情報取得元'}
            </Link>
          </li>
        </ul>
      </div>

      <div className="side-menu-lang">
        <Link to={`/ja${location.pathname.replace(/^\/(ja|en)/, '')}`} className={lang === 'ja' ? 'active' : ''}>JA</Link>
        <Link to={`/en${location.pathname.replace(/^\/(ja|en)/, '')}`} className={lang === 'en' ? 'active' : ''}>EN</Link>
      </div>
    </nav>
  )

  return (
    <>
      <button className="side-menu-toggle" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Menu">
        {mobileOpen ? '✕' : '☰'}
      </button>
      {menu}
      {mobileOpen && <div className="side-menu-overlay" onClick={() => setMobileOpen(false)} />}
    </>
  )
}

export default SideMenu
