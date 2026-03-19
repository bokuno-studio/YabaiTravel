import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AuthButton from '../AuthButton'

const mockSignInWithGoogle = vi.fn()
const mockSignOut = vi.fn()

let mockAuthState = {
  user: null as unknown,
  profile: null as unknown,
  loading: false,
  signInWithGoogle: mockSignInWithGoogle,
  signOut: mockSignOut,
  session: null,
  isSupporter: false,
  isAdmin: false,
}

vi.mock('@/lib/auth', () => ({
  useAuth: () => mockAuthState,
}))

function renderButton(isEn = false) {
  return render(
    <MemoryRouter>
      <AuthButton isEn={isEn} onNavigate={vi.fn()} />
    </MemoryRouter>
  )
}

describe('AuthButton', () => {
  it('shows loading skeleton when loading', () => {
    mockAuthState = { ...mockAuthState, loading: true, user: null }
    const { container } = renderButton()
    expect(container.querySelector('.animate-pulse')).not.toBeNull()
  })

  it('shows login button when not authenticated (Japanese)', () => {
    mockAuthState = { ...mockAuthState, loading: false, user: null }
    renderButton(false)
    expect(screen.getByText('Googleでログイン')).toBeInTheDocument()
  })

  it('shows login button when not authenticated (English)', () => {
    mockAuthState = { ...mockAuthState, loading: false, user: null }
    renderButton(true)
    expect(screen.getByText('Sign in with Google')).toBeInTheDocument()
  })

  it('calls signInWithGoogle when login button is clicked', () => {
    mockAuthState = { ...mockAuthState, loading: false, user: null }
    renderButton()
    fireEvent.click(screen.getByText('Googleでログイン'))
    expect(mockSignInWithGoogle).toHaveBeenCalled()
  })

  it('shows user name when authenticated', () => {
    mockAuthState = {
      ...mockAuthState,
      loading: false,
      user: {
        id: 'u-1',
        email: 'test@example.com',
        user_metadata: { full_name: 'Test User', avatar_url: null },
      },
      profile: { display_name: 'Test User', avatar_url: null },
    }
    renderButton()
    expect(screen.getByText('Test User')).toBeInTheDocument()
  })

  it('shows first letter when no avatar', () => {
    mockAuthState = {
      ...mockAuthState,
      loading: false,
      user: {
        id: 'u-1',
        email: 'test@example.com',
        user_metadata: { full_name: 'Alice', avatar_url: null },
      },
      profile: { display_name: 'Alice', avatar_url: null },
    }
    renderButton()
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('shows sign out dropdown on click', () => {
    mockAuthState = {
      ...mockAuthState,
      loading: false,
      user: {
        id: 'u-1',
        email: 'test@example.com',
        user_metadata: { full_name: 'Alice' },
      },
      profile: { display_name: 'Alice', avatar_url: null },
    }
    renderButton(false)
    fireEvent.click(screen.getByText('Alice'))
    expect(screen.getByText('ログアウト')).toBeInTheDocument()
  })
})
