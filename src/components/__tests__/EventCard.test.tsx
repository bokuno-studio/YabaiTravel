import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { EventCard } from '../EventCard'
import type { EventWithCategories, Category } from '@/types/event'

function makeEvent(overrides: Partial<EventWithCategories> = {}): EventWithCategories {
  return {
    id: 'ev-1',
    name: 'Test Trail Race 2025',
    event_date: '2025-06-15',
    event_date_end: null,
    location: 'Tokyo',
    location_en: null,
    country: 'Japan',
    country_en: null,
    official_url: 'https://example.com',
    entry_url: null,
    race_type: 'trail',
    participant_count: null,
    stay_status: null,
    weather_history: null,
    weather_forecast: null,
    entry_start: '2025-01-01',
    entry_end: '2025-05-01',
    entry_start_typical: null,
    entry_end_typical: null,
    reception_place: null,
    start_place: null,
    prohibited_items: null,
    course_map_url: null,
    furusato_nozei_url: null,
    event_series_id: null,
    total_cost_estimate: '50000',
    entry_type: null,
    required_qualification: null,
    previous_edition_url: null,
    visa_info: null,
    recovery_facilities: null,
    photo_spots: null,
    description: null,
    latitude: null,
    longitude: null,
    collected_at: null,
    updated_at: null,
    categories: [],
    ...overrides,
  }
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-1',
    event_id: 'ev-1',
    name: '50km',
    stay_status: null,
    distance_km: 50,
    elevation_gain: 3000,
    start_time: null,
    reception_end: null,
    reception_place: null,
    start_place: null,
    finish_rate: null,
    time_limit: null,
    cutoff_times: null,
    required_pace: null,
    required_climb_pace: null,
    mandatory_gear: null,
    recommended_gear: null,
    prohibited_items: null,
    poles_allowed: null,
    entry_fee: null,
    entry_fee_currency: null,
    itra_points: null,
    collected_at: null,
    updated_at: null,
    ...overrides,
  }
}

const defaultProps = {
  langPrefix: '/ja',
  raceTypeLabel: (type: string | null) => type || 'other',
  cardLink: '/ja/events/ev-1',
  chipsToShow: [] as Category[],
  isEnriched: true,
  t: (key: string) => key,
  lang: 'ja',
}

function renderCard(props = {}, eventOverrides = {}) {
  return render(
    <MemoryRouter>
      <EventCard
        event={makeEvent(eventOverrides)}
        {...defaultProps}
        {...props}
      />
    </MemoryRouter>
  )
}

describe('EventCard', () => {
  it('renders event name', () => {
    renderCard()
    expect(screen.getByText('Test Trail Race 2025')).toBeInTheDocument()
  })

  it('renders race type badge when enriched', () => {
    renderCard()
    expect(screen.getByText('trail')).toBeInTheDocument()
  })

  it('renders date with day of week', () => {
    renderCard()
    // 2025-06-15 is Sunday
    expect(screen.getByText(/2025-06-15/)).toBeInTheDocument()
  })

  it('renders location', () => {
    renderCard()
    expect(screen.getByText('Japan / Tokyo')).toBeInTheDocument()
  })

  it('renders cost estimate', () => {
    renderCard()
    expect(screen.getByText(/50,000/)).toBeInTheDocument()
  })

  it('renders un-enriched state with reduced opacity', () => {
    const { container } = renderCard({ isEnriched: false })
    const card = container.querySelector('.opacity-60')
    expect(card).not.toBeNull()
  })

  it('renders category chips', () => {
    const cat = makeCategory({ name: '50km' })
    renderCard({ chipsToShow: [cat] })
    expect(screen.getByText('50km')).toBeInTheDocument()
  })

  it('renders entry period', () => {
    renderCard({}, { entry_start: '2025-01-01', entry_end: '2025-05-01' })
    expect(screen.getByText(/2025-01-01/)).toBeInTheDocument()
  })

  it('renders date range when event_date_end differs', () => {
    renderCard({}, { event_date: '2025-06-15', event_date_end: '2025-06-16' })
    // Both dates should appear
    expect(screen.getByText(/2025-06-15/)).toBeInTheDocument()
    expect(screen.getByText(/2025-06-16/)).toBeInTheDocument()
  })
})
