import { Heart } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'

interface SaveButtonProps {
  categoryId: string
  isFavorite: boolean
  onToggle: (categoryId: string) => void
  isEn: boolean
}

function SaveButton({ categoryId, isFavorite, onToggle, isEn }: SaveButtonProps) {
  const { user, signInWithGoogle } = useAuth()

  if (!user) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => signInWithGoogle()}
        className="text-muted-foreground"
      >
        <Heart className="mr-1 h-4 w-4" />
        {isEn ? 'Sign in to save' : 'ログインして保存'}
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
