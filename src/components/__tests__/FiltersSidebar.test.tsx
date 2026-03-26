import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FilterBar } from '../FiltersSidebar'
import type { FiltersSidebarProps } from '../FiltersSidebar'

function makeDefaultProps(overrides: Partial<FiltersSidebarProps> = {}): FiltersSidebarProps {
  return {
    availableRaceTypes: ['trail', 'marathon'],
    raceTypes: new Set<string>(),
    onRaceTypeToggle: vi.fn(),
    raceTypeLabel: (type: string | null) => type || 'other',
    availableCategories: ['50km', '100km'],
    selectedCategories: new Set<string>(),
    onCategoryToggle: vi.fn(),
    availableMonths: ['2025-06', '2025-07'],
    selectedMonths: new Set<string>(),
    onMonthToggle: vi.fn(),
    distanceRanges: new Set<number>(),
    onDistanceRangeToggle: vi.fn(),
    distanceRangeOptions: [
      { label: '~10km', min: 0, max: 10 },
      { label: '10~20km', min: 10, max: 20 },
    ],
    timeLimitMin: '',
    onTimeLimitChange: vi.fn(),
    costPrices: [],
    costMin: 0,
    costMax: Infinity,
    costGlobalMax: 100000,
    onCostRangeChange: vi.fn(),
    poleFilter: '',
    onPoleFilterChange: vi.fn(),
    entryStatus: 'active',
    onEntryStatusChange: vi.fn(),
    showPastEvents: false,
    onShowPastEventsChange: vi.fn(),
    t: (key: string) => key,
    lang: 'ja',
    ...overrides,
  }
}

describe('FilterBar', () => {
  it('renders "No filters" message when no filters active', () => {
    render(<FilterBar {...makeDefaultProps()} />)
    expect(screen.getByText('フィルターなし')).toBeInTheDocument()
  })

  it('renders filter button', () => {
    render(<FilterBar {...makeDefaultProps()} />)
    expect(screen.getByText('絞り込み')).toBeInTheDocument()
  })

  it('renders filter button with English text', () => {
    render(<FilterBar {...makeDefaultProps({ lang: 'en' })} />)
    expect(screen.getByText('Filters')).toBeInTheDocument()
  })

  it('displays active filter chips for selected race types', () => {
    render(<FilterBar {...makeDefaultProps({ raceTypes: new Set(['trail']) })} />)
    expect(screen.getByText('trail')).toBeInTheDocument()
  })

  it('displays active filter chips for selected months', () => {
    render(<FilterBar {...makeDefaultProps({ selectedMonths: new Set(['2025-06']) })} />)
    expect(screen.getByText('2025年6月')).toBeInTheDocument()
  })

  it('shows active count badge when filters are applied', () => {
    render(<FilterBar {...makeDefaultProps({ raceTypes: new Set(['trail']), showPastEvents: true })} />)
    // Two active filters: raceType + showPastEvents
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('calls onRaceTypeToggle when chip remove button is clicked', () => {
    const onRaceTypeToggle = vi.fn()
    render(<FilterBar {...makeDefaultProps({ raceTypes: new Set(['trail']), onRaceTypeToggle })} />)
    const removeButton = screen.getByLabelText('Remove trail')
    fireEvent.click(removeButton)
    expect(onRaceTypeToggle).toHaveBeenCalledWith('trail')
  })

  it('renders cost chip when cost filter is active', () => {
    render(<FilterBar {...makeDefaultProps({ costMin: 10000, costMax: 50000 })} />)
    expect(screen.getByText(/コスト/)).toBeInTheDocument()
  })

  it('renders past events chip when showPastEvents is true', () => {
    render(<FilterBar {...makeDefaultProps({ showPastEvents: true })} />)
    expect(screen.getByText('filter.showPast')).toBeInTheDocument()
  })
})
