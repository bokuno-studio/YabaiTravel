import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import EventList from './EventList'
import { SidebarFilterProvider } from '@/contexts/SidebarFilterContext'
import { SidebarStatsProvider } from '@/contexts/SidebarStatsContext'

// Mock supabase client
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'events') {
        return {
          select: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                range: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
            order: vi.fn().mockReturnValue({
              range: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
            not: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
            gte: vi.fn().mockResolvedValue({ count: 0 }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }
    }),
  },
}))

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'site.title': 'yabai.travel',
        'site.subtitle': 'Race portal',
        'stats.lastUpdated': 'Last updated',
        'stats.weeklyNew': 'New this week',
        'event.empty': 'No events found',
        'filter.category': 'Category',
        'filter.distance': 'Distance',
        'filter.timeLimit': 'Time Limit',
        'filter.noLimit': 'No limit',
        'filter.entryStatus': 'Entry Status',
        'filter.entryActive': 'Active',
        'filter.entryOpen': 'Open',
        'filter.entryUpcoming': 'Upcoming',
        'filter.entryClosed': 'Closed',
        'filter.entryAll': 'All',
        'filter.showPast': 'Show past events',
        'filter.hoursOrMore': '{{hours}}h+',
        'event.entry': 'Entry',
        'raceType.other': 'Other',
      }
      return translations[key] || key
    },
    i18n: { language: 'ja' },
  }),
}))

// Mock EventMap (uses Google Maps which can't be loaded in tests)
vi.mock('../components/EventMap', () => ({
  default: () => <div data-testid="event-map">Map</div>,
}))

// Mock PriceHistogramSlider (uses canvas)
vi.mock('@/components/PriceHistogramSlider', () => ({
  default: () => <div data-testid="price-slider">Slider</div>,
}))

function renderEventList(lang = 'ja') {
  return render(
    <MemoryRouter initialEntries={[`/${lang}`]}>
      <SidebarFilterProvider>
        <SidebarStatsProvider>
          <Routes>
            <Route path="/:lang" element={<EventList />} />
          </Routes>
        </SidebarStatsProvider>
      </SidebarFilterProvider>
    </MemoryRouter>
  )
}

describe('EventList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading skeletons initially', () => {
    renderEventList()
    // Skeletons should be rendered during loading
    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('shows empty state when no events', async () => {
    renderEventList()
    await waitFor(() => {
      expect(screen.getByText('No events found')).toBeInTheDocument()
    })
  })

  it('shows filter bar', async () => {
    renderEventList()
    await waitFor(() => {
      expect(screen.getByText('絞り込み')).toBeInTheDocument()
    })
  })

  it('shows map toggle button (default: map visible, shows hide option)', async () => {
    renderEventList()
    await waitFor(() => {
      expect(screen.getByText('地図を非表示')).toBeInTheDocument()
    })
  })

  it('shows event count', async () => {
    renderEventList()
    await waitFor(() => {
      expect(screen.getByText('0 件')).toBeInTheDocument()
    })
  })
})
