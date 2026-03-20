import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import '../App.css'

const SOURCES = [
  { name: 'RUNNET', url: 'https://runnet.jp/', types: 'trail' },
  { name: 'SportsEntry', url: 'https://www.sportsentry.ne.jp/', types: 'marathon, trail, cycling, etc.' },
  { name: 'Lawson DO!', url: 'https://do.l-tike.com/', types: 'triathlon, marathon, etc.' },
  { name: 'Spartan Race', url: 'https://www.spartan.com/', types: 'spartan' },
  { name: 'HYROX', url: 'https://hyrox.com/', types: 'hyrox' },
  { name: 'UTMB World Series', url: 'https://utmb.world/utmb-world-series-events', types: 'trail' },
  { name: 'Strong Viking', url: 'https://strongviking.com/en/tickets/', types: 'obstacle' },
  { name: 'Golden Trail Series', url: 'https://goldentrailseries.com/', types: 'trail' },
  { name: 'Hardrock 100 Qualifying Races', url: 'https://hardrock100.com/hardrock-qualify.php', types: 'trail' },
  { name: 'Tough Mudder', url: 'https://toughmudder.com/', types: 'obstacle' },
  { name: 'Devils Circuit', url: 'https://www.devilscircuit.com/', types: 'obstacle' },
  { name: 'A-Extremo', url: 'https://www.a-extremo.com/', types: 'adventure' },
  { name: 'Albatros Adventure Marathons', url: 'https://albatros-adventure-marathons.com/', types: 'marathon' },
  { name: 'Niseko Expedition', url: 'https://nisekoexpedition.jp/', types: 'adventure' },
  { name: 'AR World Series', url: 'https://arworldseries.com/races', types: 'adventure' },
  { name: 'Adventure1 Series', url: 'https://adventure1series.com/a1/', types: 'adventure' },
  { name: 'Total Warrior', url: 'https://www.totalwarrior.com/', types: 'total_warrior' },
]

function Sources() {
  const { lang } = useParams<{ lang: string }>()
  const { t } = useTranslation()
  const langPrefix = `/${lang || 'ja'}`

  return (
    <div className="event-list-page">
      <title>{lang === 'en' ? 'Data Sources | yabai.travel' : '情報取得元 | yabai.travel'}</title>
      <meta name="description" content={lang === 'en' ? 'Data sources for race information on yabai.travel. Updated daily.' : 'yabai.travel のレース情報取得元一覧。毎日自動更新。'} />
      <header className="app-header">
        <h1><Link to={langPrefix}>{t('site.title')}</Link></h1>
        <p className="app-subtitle">{lang === 'en' ? 'Data Sources' : '情報取得元'}</p>
      </header>

      <section>
        <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1rem' }}>
          {lang === 'en'
            ? 'We collect race information from the following sources. Data is automatically updated daily.'
            : '以下のサイトからレース情報を自動収集しています。データは毎日自動更新されます。'}
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
              <th style={{ padding: '0.5rem' }}>{lang === 'en' ? 'Source' : 'ソース'}</th>
              <th style={{ padding: '0.5rem' }}>{lang === 'en' ? 'Race Types' : 'レース種別'}</th>
            </tr>
          </thead>
          <tbody>
            {SOURCES.map((s) => (
              <tr key={s.name} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '0.5rem' }}>
                  <a href={s.url} target="_blank" rel="noreferrer" style={{ color: '#3b82f6', textDecoration: 'none' }}>
                    {s.name}
                  </a>
                </td>
                <td style={{ padding: '0.5rem', color: '#475569' }}>{s.types}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p style={{ marginTop: '2rem' }}>
        <Link to={langPrefix} style={{ color: '#3b82f6', textDecoration: 'none', fontSize: '0.9rem' }}>
          ← {lang === 'en' ? 'Back to list' : '一覧に戻る'}
        </Link>
      </p>
    </div>
  )
}

export default Sources
