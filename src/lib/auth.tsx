import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import type { UserProfile } from '@/types/auth'
import { isAuthError, handleAuthError } from './authErrorHandler'

interface AuthContextType {
  user: User | null
  profile: UserProfile | null
  session: Session | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  isSupporter: boolean
  isAdmin: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  session: null,
  loading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
  isSupporter: false,
  isAdmin: false,
})

export function useAuth() {
  return useContext(AuthContext)
}

// Lazy-load supabase client to avoid modulepreloading vendor-supabase (172KB)
function getSupabase() {
  return import('./supabaseClient').then((m) => m.supabase)
}

async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    // 認証エラーの場合は自動サインアウト
    if (isAuthError(error)) {
      await handleAuthError(supabase)
      return null
    }
    // その他のエラーはコンソールに出力
    console.error('Failed to fetch user profile:', error.message)
    return null
  }

  return data as UserProfile
}

/** Dev mock: localStorage に yabai_mock_auth があればそれを使う */
function getDevMock(): { user: User; profile: UserProfile; session: Session } | null {
  try {
    const raw = localStorage.getItem('yabai_mock_auth')
    if (!raw) return null
    const mock = JSON.parse(raw)
    return {
      user: mock.user as User,
      profile: mock.profile as UserProfile,
      session: { access_token: 'mock-token', user: mock.user } as Session,
    }
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (currentUser: User | null) => {
    if (!currentUser) {
      setProfile(null)
      return
    }
    const p = await fetchProfile(currentUser.id)
    setProfile(p)
  }, [])

  useEffect(() => {
    // Check for dev mock first
    const mock = getDevMock()
    if (mock) {
      setUser(mock.user)
      setProfile(mock.profile)
      setSession(mock.session)
      setLoading(false)
      return
    }

    // Get initial session (lazy-load supabase)
    let subscription: { unsubscribe: () => void } | null = null
    getSupabase().then((supabase) => {
      supabase.auth.getSession().then(({ data: { session: s } }) => {
        setSession(s)
        setUser(s?.user ?? null)
        loadProfile(s?.user ?? null).finally(() => setLoading(false))
      })

      // Listen for auth changes
      const { data: { subscription: sub } } = supabase.auth.onAuthStateChange(
        (_event, s) => {
          setSession(s)
          setUser(s?.user ?? null)
          loadProfile(s?.user ?? null)
        },
      )
      subscription = sub
    })

    return () => {
      subscription?.unsubscribe()
    }
  }, [loadProfile])

  const signInWithGoogle = useCallback(async () => {
    const supabase = await getSupabase()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.href,
      },
    })
    if (error) {
      console.error('Google sign-in error:', error.message)
    }
  }, [])

  const signOut = useCallback(async () => {
    localStorage.removeItem('yabai_mock_auth')
    const supabase = await getSupabase()
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Sign-out error:', error.message)
    }
    setUser(null)
    setProfile(null)
    setSession(null)
  }, [])

  const isAdmin = profile?.role === 'admin'
  const isSupporter = isAdmin || profile?.membership === 'supporter'

  return (
    <AuthContext.Provider
      value={{ user, profile, session, loading, signInWithGoogle, signOut, isSupporter, isAdmin }}
    >
      {children}
    </AuthContext.Provider>
  )
}
