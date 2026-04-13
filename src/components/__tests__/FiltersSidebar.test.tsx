import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FilterBar } from '../FiltersSidebar'
import type { FiltersSidebarProps } from '../FiltersSidebar'

function makeDefaultProps(overrides: Partial<FiltersSidebarProps> = {}): FiltersSidebarProps {
  return {
    availableCountries: [],
    countries: new Set<string>(),
    onCountryToggle: vi.fn(),
    availableRaceTypes: ['trail', 'marathon'],
    raceTypes: new Set<string>(),
    onRaceTypeToggle: vi.fn(),
    raceTypeLabel: (type: string | null) => type || 'other',
    dateRangeStart: null,
    dateRangeEnd: null,
    onDateRangeChange: vi.fn(),
    distanceRanges: new Set<number>(),
    onDistanceRangeToggle: vi.fn(),
    distanceRangeOptions: [
      { label: '~10km', min: 0, max: 10 },
      { label: '10~20km', min: 10, max: 20 },
    ],
    futureOnly: true,
    onFutureOnlyChange: vi.fn(),
    t: (key: string) => key,
    lang: 'ja',
    ...overrides,
  }
}

describe('FilterBar', () => {
  it('renders default message when no filters active', () => {
    render(<FilterBar {...makeDefaultProps()} />)
    expect(screen.getByText('デフォルト条件で表示中')).toBeInTheDocument()
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

  it('displays active filter chip for date range', () => {
    render(<FilterBar {...makeDefaultProps({ dateRangeStart: '2025-06-01', dateRangeEnd: '2025-06-30' })} />)
    expect(screen.getByText('2025年6月1日 - 2025年6月30日')).toBeInTheDocument()
  })

  it('shows active count badge when filters are applied', () => {
    render(<FilterBar {...makeDefaultProps({ raceTypes: new Set(['trail']), futureOnly: false })} />)
    // Two active filters: raceType + futureOnly off
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('calls onRaceTypeToggle when chip remove button is clicked', () => {
    const onRaceTypeToggle = vi.fn()
    render(<FilterBar {...makeDefaultProps({ raceTypes: new Set(['trail']), onRaceTypeToggle })} />)
    const removeButton = screen.getByLabelText('Remove trail')
    fireEvent.click(removeButton)
    expect(onRaceTypeToggle).toHaveBeenCalledWith('trail')
  })

  it('displays country filter chips', () => {
    render(<FilterBar {...makeDefaultProps({ countries: new Set(['Japan']) })} />)
    expect(screen.getByText('Japan')).toBeInTheDocument()
  })

  it('renders future only chip when disabled', () => {
    render(<FilterBar {...makeDefaultProps({ futureOnly: false })} />)
    expect(screen.getByText('過去も含む')).toBeInTheDocument()
  })
})
