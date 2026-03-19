import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Feedback from './Feedback'

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

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
  }
})()
vi.stubGlobal('localStorage', localStorageMock)

function renderFeedback(lang = 'ja') {
  return render(
    <MemoryRouter initialEntries={[`/${lang}/feedback`]}>
      <Routes>
        <Route path="/:lang/feedback" element={<Feedback />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    })
  })

  it('renders page title', async () => {
    renderFeedback()
    expect(screen.getByText('みんなのアイデア')).toBeInTheDocument()
  })

  it('shows loading state initially', () => {
    // Use a fetch that never resolves to keep loading state
    mockFetch.mockReturnValue(new Promise(() => {}))
    renderFeedback()
    const pulseElements = document.querySelectorAll('.animate-pulse')
    expect(pulseElements.length).toBeGreaterThan(0)
  })

  it('shows empty state when no feedbacks', async () => {
    renderFeedback()
    await waitFor(() => {
      expect(screen.getByText('フィードバックはまだありません')).toBeInTheDocument()
    })
  })

  it('renders filter buttons', async () => {
    renderFeedback()
    expect(screen.getByText('すべて')).toBeInTheDocument()
    expect(screen.getByText('要望')).toBeInTheDocument()
    expect(screen.getByText('全ステータス')).toBeInTheDocument()
  })

  it('shows Crew-only notice for non-supporters', () => {
    renderFeedback()
    expect(screen.getByText(/Crewだけがリクエストを投稿できます/)).toBeInTheDocument()
  })

  it('renders feedback items when data is returned', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: [
          {
            id: 'fb-1',
            content: 'More filters please',
            feedback_type: 'feature',
            status: 'new',
            vote_count: 5,
            github_issue_url: null,
            source_url: null,
            user_id: null,
            created_at: '2025-06-01T00:00:00Z',
          },
        ],
      }),
    })

    renderFeedback()
    await waitFor(() => {
      expect(screen.getByText('More filters please')).toBeInTheDocument()
    })
  })

  it('shows vote count', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: [
          {
            id: 'fb-1',
            content: 'Test feedback',
            feedback_type: 'feature',
            status: 'new',
            vote_count: 42,
            github_issue_url: null,
            source_url: null,
            user_id: null,
            created_at: '2025-06-01T00:00:00Z',
          },
        ],
      }),
    })

    renderFeedback()
    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument()
    })
  })
})
