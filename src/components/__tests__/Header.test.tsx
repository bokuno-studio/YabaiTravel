import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Header } from '../Header'

describe('Header', () => {
  it('renders last updated timestamp', () => {
    render(
      <Header
        title="Test"
        subtitle="Sub"
        lastUpdated="2025-06-15T10:00:00Z"
        weeklyNewCount={0}
        statsLastUpdatedLabel="Last updated"
        statsWeeklyNewLabel="New this week"
      />
    )
    expect(screen.getByText(/Last updated/)).toBeInTheDocument()
  })

  it('renders weekly new count when > 0', () => {
    render(
      <Header
        title="Test"
        subtitle="Sub"
        lastUpdated={null}
        weeklyNewCount={42}
        statsLastUpdatedLabel="Last updated"
        statsWeeklyNewLabel="New this week"
      />
    )
    expect(screen.getByText(/New this week.*42/)).toBeInTheDocument()
  })

  it('renders nothing when no stats available', () => {
    const { container } = render(
      <Header
        title="Test"
        subtitle="Sub"
        lastUpdated={null}
        weeklyNewCount={0}
        statsLastUpdatedLabel="Last updated"
        statsWeeklyNewLabel="New this week"
      />
    )
    // No stats container rendered
    expect(container.querySelector('.mb-4')).toBeNull()
  })

  it('renders both stats when both available', () => {
    render(
      <Header
        title="Test"
        subtitle="Sub"
        lastUpdated="2025-06-15T10:00:00Z"
        weeklyNewCount={10}
        statsLastUpdatedLabel="Last updated"
        statsWeeklyNewLabel="New this week"
      />
    )
    expect(screen.getByText(/Last updated/)).toBeInTheDocument()
    expect(screen.getByText(/New this week.*10/)).toBeInTheDocument()
  })
})
