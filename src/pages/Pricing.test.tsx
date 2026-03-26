import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Pricing from './Pricing'

let mockAuthState = {
  user: null as unknown,
  profile: null as unknown,
  session: null as unknown,
  loading: false,
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
  isSupporter: false,
  isAdmin: false,
}

vi.mock('@/lib/auth', () => ({
  useAuth: () => mockAuthState,
}))

vi.mock('@/lib/payment', () => ({
  createCheckout: vi.fn(),
  cancelMembership: vi.fn(),
}))

function renderPricing(lang = 'ja') {
  return render(
    <MemoryRouter initialEntries={[`/${lang}/pricing`]}>
      <Routes>
        <Route path="/:lang/pricing" element={<Pricing />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Pricing', () => {
  it('renders page title in Japanese', () => {
    mockAuthState = { ...mockAuthState, user: null, isSupporter: false }
    renderPricing()
    expect(screen.getByText('yabai.travel を応援')).toBeInTheDocument()
  })

  it('renders page title in English', () => {
    mockAuthState = { ...mockAuthState, user: null, isSupporter: false }
    renderPricing('en')
    expect(screen.getByText('Support yabai.travel')).toBeInTheDocument()
  })

  it('renders donation card', () => {
    mockAuthState = { ...mockAuthState, user: null, isSupporter: false }
    renderPricing()
    expect(screen.getByText('単発寄付')).toBeInTheDocument()
    expect(screen.getByText('寄付する')).toBeInTheDocument()
  })

  it('renders crew membership card', () => {
    mockAuthState = { ...mockAuthState, user: null, isSupporter: false }
    renderPricing()
    expect(screen.getByText('Crew')).toBeInTheDocument()
    expect(screen.getByText('おすすめ')).toBeInTheDocument()
  })

  it('shows Google sign-in button when not authenticated', () => {
    mockAuthState = { ...mockAuthState, user: null, isSupporter: false }
    renderPricing()
    expect(screen.getByText('Googleでログインして Crew になる')).toBeInTheDocument()
  })

  it('shows subscribe button when authenticated but not supporter', () => {
    mockAuthState = {
      ...mockAuthState,
      user: { id: 'u-1', email: 'test@example.com', user_metadata: {} },
      session: { access_token: 'token' },
      isSupporter: false,
    }
    renderPricing()
    expect(screen.getByText('Crewになる')).toBeInTheDocument()
  })

  it('shows crew badge when user is supporter', () => {
    mockAuthState = {
      ...mockAuthState,
      user: { id: 'u-1', email: 'test@example.com', user_metadata: {} },
      session: { access_token: 'token' },
      isSupporter: true,
    }
    renderPricing()
    expect(screen.getByText(/Crewメンバーです/)).toBeInTheDocument()
  })

  it('shows cancel membership button for supporters', () => {
    mockAuthState = {
      ...mockAuthState,
      user: { id: 'u-1', email: 'test@example.com', user_metadata: {} },
      session: { access_token: 'token' },
      isSupporter: true,
    }
    renderPricing()
    expect(screen.getByText('メンバーシップをキャンセル')).toBeInTheDocument()
  })

  it('renders supporter features list', () => {
    mockAuthState = { ...mockAuthState, user: null, isSupporter: false }
    renderPricing()
    expect(screen.getByText('要望掲示板コメント権')).toBeInTheDocument()
    expect(screen.getByText('各ページで要望投稿')).toBeInTheDocument()
  })

  it('renders legal notice link', () => {
    mockAuthState = { ...mockAuthState, user: null, isSupporter: false }
    renderPricing()
    expect(screen.getByText('特定商取引法に基づく表記')).toBeInTheDocument()
  })
})
