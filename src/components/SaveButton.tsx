import { Heart } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'

interface SaveButtonProps {
  categoryId: string
  isFavorite: boolean
  onToggle: (categoryId: string) => void
  isEn: boolean
}

function SaveButton({ categoryId, isFavorite, onToggle, isEn }: SaveButtonProps) {
  const { user, isSupporter } = useAuth()

  if (!user || !isSupporter) {
    return (
      <Button variant="ghost" size="sm" asChild>
        <Link to={`/${isEn ? 'en' : 'ja'}/pricing`} className="text-muted-foreground">
          <Heart className="mr-1 h-4 w-4" />
          {isEn ? 'Become Crew' : 'Crewになる'}
        </Link>
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onToggle(categoryId)}
      aria-label={isFavorite ? (isEn ? 'Remove from saved' : '保存を解除') : (isEn ? 'Save race' : 'レースを保存')}
      className="text-muted-foreground hover:text-primary"
    >
      <Heart
        className={`mr-1 h-4 w-4 ${isFavorite ? 'fill-red-500 text-red-500' : ''}`}
      />
      {isFavorite ? (isEn ? 'Saved' : '保存済み') : (isEn ? 'Save' : '保存')}
    </Button>
  )
}

export default SaveButton
