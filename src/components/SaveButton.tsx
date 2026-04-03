import { Heart } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { trackCtaClick } from '@/lib/analytics'

interface SaveButtonProps {
  categoryId: string
  isFavorite: boolean
  isGoing?: boolean
  onToggle: (categoryId: string, status?: 'favorite' | 'going') => void
  isEn: boolean
}

function SaveButton({ categoryId, isFavorite, isGoing, onToggle, isEn }: SaveButtonProps) {
  const { user, signInWithGoogle } = useAuth()

  if (!user) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => { trackCtaClick('favorite_prompt', window.location.pathname); signInWithGoogle() }}
        className="text-muted-foreground"
      >
        <Heart className="mr-1 h-4 w-4" />
        {isEn ? 'Sign in to save' : 'ログインして保存'}
      </Button>
    )
  }

  return (
    <div className="flex gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onToggle(categoryId, 'favorite')}
        aria-label={isFavorite ? (isEn ? 'Remove from saved' : '保存を解除') : (isEn ? 'Save race' : 'レースを保存')}
        className="text-muted-foreground hover:text-primary"
      >
        <Heart
          className={`mr-1 h-4 w-4 ${isFavorite ? 'fill-red-500 text-red-500' : ''}`}
        />
        {isFavorite ? (isEn ? 'Saved' : '保存済み') : (isEn ? 'Save' : '保存')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onToggle(categoryId, 'going')}
        aria-label={isGoing ? (isEn ? 'Unmark as going' : '行く確定を解除') : (isEn ? 'Mark as going' : '行く確定')}
        className="text-muted-foreground hover:text-primary"
      >
        {isGoing ? (isEn ? '✓ Going' : '✓ 行く確定') : (isEn ? 'Going?' : '行く確定')}
      </Button>
    </div>
  )
}

export default SaveButton
