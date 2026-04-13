import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { EventCard } from '../EventCard'
import type { EventWithCategories } from '@/types/event'

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

const defaultProps = {
  raceTypeLabel: (type: string | null) => type || 'other',
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

  it('renders race type badge', () => {
    renderCard()
    expect(screen.getByText('trail')).toBeInTheDocument()
  })

  it('renders date with day of week', () => {
    renderCard()
    // 2025-06-15 is Sunday → 日
    expect(screen.getByText('2025-06-15（日）')).toBeInTheDocument()
  })

  it('renders location', () => {
    renderCard()
    expect(screen.getByText('Japan / Tokyo')).toBeInTheDocument()
  })

  it('renders distances from categories', () => {
    renderCard({}, {
      categories: [
        { id: 'cat-1', event_id: 'ev-1', name: '50km', distance_km: 50 },
      ],
    })
    expect(screen.getByText('50km')).toBeInTheDocument()
  })

  it('renders entry status badge', () => {
    // entry_end is 2025-05-01 which is in the past, so status should be "closed"
    renderCard()
    expect(screen.getByText('受付終了')).toBeInTheDocument()
  })

  it('renders official site link', () => {
    renderCard()
    expect(screen.getByText('公式サイト')).toBeInTheDocument()
  })

  it('renders date range when event_date_end differs', () => {
    renderCard({}, { event_date: '2025-06-15', event_date_end: '2025-06-16' })
    // Both dates should appear in range format
    expect(screen.getByText(/2025-06-15（日）/)).toBeInTheDocument()
    expect(screen.getByText(/2025-06-16（月）/)).toBeInTheDocument()
  })

  it('renders no description message when description is null', () => {
    renderCard()
    expect(screen.getByText('紹介文はありません。')).toBeInTheDocument()
  })
})
