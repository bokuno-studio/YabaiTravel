import { useState } from 'react'
import './App.css'

type RaceType = 'marathon' | 'trail' | 'spartan' | 'other'

type EventItem = {
  id: string
  name: string
  date: string
  location: string
  raceType: RaceType
}

const MOCK_EVENTS: EventItem[] = [
  {
    id: '1',
    name: 'Mt. FUJI TRAIL 100K',
    date: '2026-05-10',
    location: '山梨県・静岡県',
    raceType: 'trail',
  },
  {
    id: '2',
    name: 'TOKYO MARATHON',
    date: '2026-03-01',
    location: '東京都',
    raceType: 'marathon',
  },
  {
    id: '3',
    name: 'SPARTAN RACE CHIBA BEAST',
    date: '2026-09-20',
    location: '千葉県',
    raceType: 'spartan',
  },
  {
    id: '4',
    name: 'GOLDEN TRAIL SERIES JAPAN',
    date: '2026-07-15',
    location: '長野県',
    raceType: 'trail',
  },
]

function App() {
  const [raceType, setRaceType] = useState<RaceType | 'all'>('all')
  const [month, setMonth] = useState<string>('')

  const filtered = MOCK_EVENTS.filter((event) => {
    if (raceType !== 'all' && event.raceType !== raceType) return false
    if (month) {
      const [y, m] = month.split('-')
      if (!event.date.startsWith(`${y}-${m}`)) return false
    }
    return true
  })

  return (
    <div className="app">
      <header className="app-header">
        <h1>yabai.travel</h1>
        <p className="app-subtitle">変態レースカレンダー（モック）</p>
      </header>

      <section className="filters">
        <div className="filter-group">
          <label htmlFor="raceType">レース種別</label>
          <select
            id="raceType"
            value={raceType}
            onChange={(e) => setRaceType(e.target.value as RaceType | 'all')}
          >
            <option value="all">すべて</option>
            <option value="marathon">マラソン</option>
            <option value="trail">トレラン</option>
            <option value="spartan">スパルタン</option>
            <option value="other">その他</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="month">開催月</label>
          <input
            id="month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
      </section>

      <section className="event-list">
        {filtered.length === 0 ? (
          <p className="empty">条件に合う大会がありません。</p>
        ) : (
          <ul>
            {filtered.map((event) => (
              <li key={event.id} className="event-card">
                <div className="event-main">
                  <h2>{event.name}</h2>
                  <p className="event-meta">
                    <span>{event.date}</span>
                    <span> / {event.location}</span>
                  </p>
                </div>
                <span className={`badge badge-${event.raceType}`}>
                  {event.raceType === 'marathon' && 'マラソン'}
                  {event.raceType === 'trail' && 'トレラン'}
                  {event.raceType === 'spartan' && 'スパルタン'}
                  {event.raceType === 'other' && 'その他'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export default App
