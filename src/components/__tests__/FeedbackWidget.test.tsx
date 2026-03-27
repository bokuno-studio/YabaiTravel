import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import FeedbackWidget from '../FeedbackWidget'

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

function renderWidget(lang = 'ja') {
  return render(
    <MemoryRouter initialEntries={[`/${lang}`]}>
      <Routes>
        <Route path="/:lang" element={<FeedbackWidget />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('FeedbackWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the trigger button', () => {
    renderWidget()
    expect(screen.getByText('バグ報告・アイデア')).toBeInTheDocument()
  })

  it('opens the widget on click', () => {
    renderWidget()
    fireEvent.click(screen.getByText('バグ報告・アイデア'))
    // Widget panel should now be visible with header
    expect(screen.getByText('バグ報告・アイデア')).toBeInTheDocument()
    // Textarea should be present
    expect(screen.getByPlaceholderText('どこで何が起きましたか？')).toBeInTheDocument()
  })

  it('shows bug type selector by default', () => {
    renderWidget()
    fireEvent.click(screen.getByText('バグ報告・アイデア'))
    expect(screen.getByText('バグ')).toBeInTheDocument()
  })

  it('shows idea button for all users', () => {
    renderWidget()
    fireEvent.click(screen.getByText('バグ報告・アイデア'))
    expect(screen.getByText('アイデア')).toBeInTheDocument()
  })

  it('disables send button when textarea is empty', () => {
    renderWidget()
    fireEvent.click(screen.getByText('バグ報告・アイデア'))
    const sendButton = screen.getByText('送信')
    expect(sendButton.closest('button')).toBeDisabled()
  })

  it('enables send button when textarea has content', () => {
    renderWidget()
    fireEvent.click(screen.getByText('バグ報告・アイデア'))
    const textarea = screen.getByPlaceholderText('どこで何が起きましたか？')
    fireEvent.change(textarea, { target: { value: 'Something is broken' } })
    const sendButton = screen.getByText('送信')
    expect(sendButton.closest('button')).not.toBeDisabled()
  })

  it('renders English text when lang is en', () => {
    renderWidget('en')
    expect(screen.getByText('Report / Idea')).toBeInTheDocument()
  })
})
