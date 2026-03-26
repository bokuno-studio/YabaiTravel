import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { trackCtaClick } from '@/lib/analytics'
import type { User } from '@supabase/supabase-js'

interface Props {
  isEn: boolean
  langPrefix: string
  user: User | null
  isSupporter: boolean
  signInWithGoogle: () => Promise<void>
}

function ViewLimitWall({ isEn, langPrefix, user, signInWithGoogle }: Props) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-amber-200 bg-amber-50/50 p-8 text-center my-8">
      <p className="text-lg font-semibold text-foreground mb-2">
        {isEn ? 'You\'ve used all your free views this month' : '今月の無料閲覧を使い切りました'}
      </p>

      {!user ? (
        <>
          <p className="text-sm text-muted-foreground mb-6">
            {isEn
              ? 'Sign in with Google to view up to 30 race details per month for free.'
              : 'Googleアカウントを連携すると30件まで閲覧できます。'}
          </p>
          <Button onClick={() => { trackCtaClick('signin_viewlimit', window.location.pathname); signInWithGoogle() }}>
            {isEn ? 'Sign in with Google' : 'Googleアカウント連携'}
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-6">
            {isEn
              ? 'Become a Crew member to enjoy unlimited access to all race details, save favorites, and more.'
              : 'Crewになると無制限で閲覧できます。お気に入り保存などの機能もご利用いただけます。'}
          </p>
          <Button asChild>
            <Link to={`${langPrefix}/pricing`} onClick={() => trackCtaClick('crew_viewlimit', window.location.pathname)}>
              {isEn ? 'Learn about Crew' : 'Crewについて詳しく'}
            </Link>
          </Button>
        </>
      )}
    </div>
  )
}

export default ViewLimitWall
