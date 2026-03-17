import { Link, useParams, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import './SideMenu.css'

const SPORT_GUIDES = [
  { key: 'marathon', ja: 'マラソン', en: 'Marathon' },
  { key: 'trail', ja: 'トレイルランニング', en: 'Trail Running' },
  { key: 'triathlon', ja: 'トライアスロン', en: 'Triathlon' },
  { key: 'spartan', ja: 'スパルタンレース', en: 'Spartan Race' },
  { key: 'hyrox', ja: 'HYROX', en: 'HYROX' },
  { key: 'obstacle', ja: 'オブスタクルレース', en: 'Obstacle Course Racing' },
  { key: 'cycling', ja: 'サイクリング', en: 'Cycling' },
  { key: 'duathlon', ja: 'デュアスロン', en: 'Duathlon' },
  { key: 'rogaining', ja: 'ロゲイニング', en: 'Rogaining' },
  { key: 'adventure', ja: 'アドベンチャーレース', en: 'Adventure Racing' },
]

function SideMenu() {
  const { lang } = useParams<{ lang: string }>()
  useTranslation()
  const location = useLocation()
  const langPrefix = `/${lang || 'ja'}`
  const isEn = lang === 'en'
  const [open, setOpen] = useState(false)

  return (
    <>
      <button className="side-menu-toggle" onClick={() => setOpen(!open)} aria-label="Menu">
        {open ? '✕' : '☰'}
      </button>

      <nav className={`side-menu${open ? ' side-menu--open' : ''}`}>
        <div className="side-menu-section">
          <h3>{isEn ? 'Sports Guide' : 'スポーツガイド'}</h3>
          <ul>
            {SPORT_GUIDES.map((s) => (
              <li key={s.key}>
                <Link
                  to={`${langPrefix}/guide/${s.key}`}
                  className={location.pathname.includes(`/guide/${s.key}`) ? 'active' : ''}
                  onClick={() => setOpen(false)}
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
              <Link to={`${langPrefix}/sources`} onClick={() => setOpen(false)}>
                {isEn ? 'Data Sources' : '情報取得元'}
              </Link>
            </li>
            <li>
              <Link to={langPrefix} onClick={() => setOpen(false)}>
                {isEn ? 'Race List' : 'レース一覧'}
              </Link>
            </li>
          </ul>
        </div>
      </nav>

      {open && <div className="side-menu-overlay" onClick={() => setOpen(false)} />}
    </>
  )
}

export default SideMenu
