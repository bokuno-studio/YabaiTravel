import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { EventComment } from '@/types/event'

interface EventCommentsProps {
  eventId?: string
  categoryId?: string
  raceType?: string
  isEn: boolean
  /** Max comments to show (default: unlimited) */
  limit?: number
}

function EventComments({ eventId, categoryId, raceType, isEn, limit }: EventCommentsProps) {
  const { user, loading: authLoading, signInWithGoogle } = useAuth()
  const [comments, setComments] = useState<EventComment[]>([])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchComments = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (categoryId) {
        params.set('category_id', categoryId)
      } else if (eventId) {
        params.set('event_id', eventId)
      } else if (raceType) {
        params.set('race_type', raceType)
      }
      if (limit) {
        params.set('limit', String(limit))
      }
      const res = await fetch(`/api/event-comment?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch comments')
      const json = await res.json()
      setComments(json.data ?? [])
    } catch {
      console.error('Failed to load comments')
    } finally {
      setLoading(false)
    }
  }, [eventId, categoryId, raceType, limit])

  useEffect(() => {
    fetchComments()
  }, [fetchComments])

  const handleSubmit = async () => {
    if (!content.trim() || !eventId) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/event-comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          category_id: categoryId || null,
          content: content.trim(),
          user_id: user?.id || null,
          display_name: displayName.trim() || user?.user_metadata?.full_name || null,
          race_type: raceType || null,
          payment_id: 'mvp-free', // MVP: no actual payment yet
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || 'Failed to post comment')
      }
      setContent('')
      setDisplayName('')
      await fetchComments()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post comment')
    } finally {
      setSubmitting(false)
    }
  }

  const formatDate = (d: string) => {
    try {
      const date = new Date(d)
      return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
    } catch {
      return d
    }
  }

  // Read-only mode: no eventId means we can only show, not post (e.g. SportGuide)
  const canPost = !!eventId

  return (
    <Card className="mb-4 mt-6">
      <CardHeader>
        <CardTitle className="text-base">
          {isEn ? 'Race Reports' : 'レースレポート・口コミ'}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {isEn ? '1 comment = $1 (payment integration coming soon)' : '1コメント ¥150（決済機能は近日実装予定）'}
        </p>
      </CardHeader>
      <CardContent>
        {/* Comment list */}
        {loading ? (
          <p className="text-sm text-muted-foreground">
            {isEn ? 'Loading comments...' : 'コメントを読み込み中...'}
          </p>
        ) : comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {isEn ? 'No comments yet. Be the first to share your experience!' : 'まだコメントはありません。最初のレポートを投稿しましょう！'}
          </p>
        ) : (
          <div className="space-y-4">
            {comments.map((c) => (
              <div key={c.id} className="border-b border-border/40 pb-3 last:border-0">
                <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {c.display_name || (isEn ? 'Anonymous' : '匿名')}
                  </span>
                  <span>{formatDate(c.created_at)}</span>
                </div>
                <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {c.content}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Post form */}
        {canPost && (
          <div className="mt-6 border-t border-border pt-4">
            {authLoading ? null : !user ? (
              <div className="text-center">
                <p className="mb-2 text-sm text-muted-foreground">
                  {isEn ? 'Sign in to post a comment' : 'コメントするにはログインが必要です'}
                </p>
                <Button variant="outline" size="sm" onClick={signInWithGoogle}>
                  {isEn ? 'Sign in with Google' : 'Googleでログイン'}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder={isEn ? 'Display name (optional)' : '表示名（任意）'}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={50}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <textarea
                  placeholder={isEn ? 'Share your race experience...' : 'レースの感想やアドバイスを共有しましょう...'}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  maxLength={5000}
                  rows={4}
                  className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                {error && (
                  <p className="text-xs text-destructive">{error}</p>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {content.length}/5000
                  </span>
                  <Button
                    size="sm"
                    disabled={submitting || !content.trim()}
                    onClick={handleSubmit}
                  >
                    {submitting
                      ? (isEn ? 'Posting...' : '投稿中...')
                      : (isEn ? 'Post for $1' : '¥150で投稿')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default EventComments
