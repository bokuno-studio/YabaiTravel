import { useState, useRef, useEffect } from 'react'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

interface AuthButtonProps {
  isEn: boolean
  onNavigate?: () => void
}

export default function AuthButton({ isEn, onNavigate }: AuthButtonProps) {
  const { user, profile, loading, signInWithGoogle, signOut } = useAuth()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [dropdownOpen])

  if (loading) {
    return (
      <div className="px-3 py-2">
        <div className="h-8 w-full animate-pulse rounded-md bg-muted" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="px-3 py-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 text-sm"
          onClick={() => {
            signInWithGoogle()
            onNavigate?.()
          }}
        >
          <GoogleIcon className="h-4 w-4" />
          {isEn ? 'Sign in with Google' : 'Googleでログイン'}
        </Button>
      </div>
    )
  }

  const displayName = profile?.display_name || user.user_metadata?.full_name || user.email || ''
  const avatarUrl = profile?.avatar_url || user.user_metadata?.avatar_url

  return (
    <div className="relative px-3 py-2" ref={dropdownRef}>
      <button
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/70 hover:bg-muted transition-colors cursor-pointer border-0 bg-transparent text-left"
        onClick={() => setDropdownOpen(!dropdownOpen)}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="h-6 w-6 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="truncate text-sm">{displayName}</span>
      </button>

      {dropdownOpen && (
        <div className="absolute bottom-full left-3 right-3 mb-1 rounded-md border border-border bg-background shadow-md z-10">
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground/70 hover:bg-muted transition-colors cursor-pointer border-0 bg-transparent text-left"
            onClick={() => {
              signOut()
              setDropdownOpen(false)
              onNavigate?.()
            }}
          >
            <LogOut className="h-4 w-4" />
            {isEn ? 'Sign out' : 'ログアウト'}
          </button>
        </div>
      )}
    </div>
  )
}
