import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

interface Props { isEn: boolean; langPrefix: string }

function ViewLimitWall({ isEn, langPrefix }: Props) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-amber-200 bg-amber-50/50 p-8 text-center my-8">
      <p className="text-lg font-semibold text-foreground mb-2">
        {isEn ? 'You\'ve used all your free views this month' : '今月の無料閲覧を使い切りました'}
      </p>
      <p className="text-sm text-muted-foreground mb-6">
        {isEn
          ? 'Become a Crew member to enjoy unlimited access to all race details, save favorites, and more.'
          : 'Crewメンバーになると、全レースの詳細を無制限で閲覧できます。お気に入り保存などの機能もご利用いただけます。'}
      </p>
      <Button asChild>
        <Link to={`${langPrefix}/pricing`}>
          {isEn ? 'Learn about Crew' : 'Crewについて詳しく'}
        </Link>
      </Button>
    </div>
  )
}

export default ViewLimitWall
