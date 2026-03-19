import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import SideMenu from '../SideMenu'
import { SidebarFilterProvider } from '@/contexts/SidebarFilterContext'
import { SidebarStatsProvider } from '@/contexts/SidebarStatsContext'

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: null,
    profile: null,
    session: null,
    loading: false,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    isSupporter: false,
    isAdmin: false,
  }),
}))

function renderMenu(_lang = 'ja', path = '/ja') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SidebarFilterProvider>
        <SidebarStatsProvider>
          <Routes>
            <Route path="/:lang/*" element={<SideMenu />} />
            <Route path="/:lang" element={<SideMenu />} />
          </Routes>
        </SidebarStatsProvider>
      </SidebarFilterProvider>
    </MemoryRouter>
  )
}

describe('SideMenu', () => {
  it('renders logo link', () => {
    renderMenu()
    expect(screen.getAllByText('yabai.travel').length).toBeGreaterThan(0)
  })

  it('renders race search link in Japanese', () => {
    renderMenu()
    expect(screen.getAllByText('レース検索').length).toBeGreaterThan(0)
  })

  it('renders navigation links', () => {
    renderMenu()
    // Pricing link
    expect(screen.getAllByText('Crewになる').length).toBeGreaterThan(0)
    // Feedback link
    expect(screen.getAllByText('みんなのアイデア').length).toBeGreaterThan(0)
    // Sources link
    expect(screen.getAllByText('情報取得元').length).toBeGreaterThan(0)
  })

  it('renders sports guides (top 3 by default)', () => {
    renderMenu()
    // First 3 guides should be visible
    expect(screen.getAllByText('マラソン').length).toBeGreaterThan(0)
    expect(screen.getAllByText('トレイルランニング').length).toBeGreaterThan(0)
    expect(screen.getAllByText('トライアスロン').length).toBeGreaterThan(0)
  })

  it('renders "show all" button for guides', () => {
    renderMenu()
    expect(screen.getAllByText('すべて表示').length).toBeGreaterThan(0)
  })

  it('renders language switcher links', () => {
    renderMenu()
    expect(screen.getAllByText('JA').length).toBeGreaterThan(0)
    expect(screen.getAllByText('EN').length).toBeGreaterThan(0)
  })

  it('renders hamburger menu button for mobile', () => {
    renderMenu()
    const menuButton = screen.getByLabelText('Menu')
    expect(menuButton).toBeInTheDocument()
  })

  it('renders English labels when lang is en', () => {
    renderMenu('en', '/en')
    expect(screen.getAllByText('Race Search').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Become Crew').length).toBeGreaterThan(0)
  })
})
