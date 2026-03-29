import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Send } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import type { EventComment } from '@/types/event'

interface EventCommentsProps {
  eventId?: string
  categoryId?: string
  raceType?: string
  isEn: boolean
  limit?: number
}

// Phase 1: コメント機能を有効化。Phase 2 で環境変数制御に戻す場合は下記を使用:
// const COMMENTS_ENABLED = !import.meta.env.PROD || !!import.meta.env.VITE_ENABLE_COMMENTS
const COMMENTS_ENABLED = true

// Phase 1: 無料開放（Phase 2 で課金復活時に false にする）
const FREE_COMMENTS = true

function EventComments({ eventId, categoryId, raceType, isEn, limit }: EventCommentsProps) {
  const { user, session } = useAuth()
  const [comments, setComments] = useState<EventComment[]>([])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  const fetchComments = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (categoryId) params.set('category_id', categoryId)
      else if (eventId) params.set('event_id', eventId)
      else if (raceType) params.set('race_type', raceType)
      if (limit) params.set('limit', String(limit))
      const res = await fetch(`/api/event-comment?${params}`)
      if (!res.ok) throw new Error('Failed to fetch comments')
      const json = await res.json()
      setComments(json.data ?? [])
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [eventId, categoryId, raceType, limit])

  useEffect(() => { fetchComments() }, [fetchComments])

  // Handle return from Square payment (Phase 2: 課金フロー)
  useEffect(() => {
    if (FREE_COMMENTS) return // Phase 1: 課金不要
    const pendingComment = searchParams.get('pending_comment')
    if (pendingComment) {
      try {
        const data = JSON.parse(decodeURIComponent(pendingComment))
        fetch('/api/event-comment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...data,
            payment_id: 'square-confirmed',
          }),
        }).then(res => {
          if (res.ok) fetchComments()
        })
      } catch { /* ignore */ }
      const newParams = new URLSearchParams(searchParams)
      newParams.delete('pending_comment')
      setSearchParams(newParams, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePublish = async () => {
    if (!content.trim() || !eventId || !user) return
    setSubmitting(true)
    setError(null)
    try {
      const commentData = {
        event_id: eventId,
        category_id: categoryId || null,
        content: content.trim(),
        display_name: displayName.trim() || null,
        race_type: raceType || null,
        user_id: user.id,
      }

      if (FREE_COMMENTS) {
        // Phase 1: 直接投稿（無料、認証付き）
        const res = await fetch('/api/event-comment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({ ...commentData, payment_id: 'free-phase1' }),
        })
        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          throw new Error(json.error || 'Failed to post comment')
        }
        setContent('')
        setDisplayName('')
        fetchComments()
      } else {
        // Phase 2: 課金フロー
        const res = await fetch('/api/square-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'comment',
            amount: 150,
            lang: isEn ? 'en' : 'ja',
            commentData: JSON.stringify(commentData),
          }),
        })
        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          throw new Error(json.error || 'Payment creation failed')
        }
        const { url } = await res.json()
        if (url) {
          sessionStorage.setItem('yabai_pending_comment', JSON.stringify(commentData))
          window.location.href = url
        } else {
          throw new Error('No payment URL returned')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setSubmitting(false)
    }
  }

  const formatDate = (d: string) => {
    try {
      const date = new Date(d)
      return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
    } catch { return d }
  }

  const canPost = !!eventId

  if (!COMMENTS_ENABLED) return null

  return (
    <Card className="mb-4 mt-6">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">
            {isEn ? 'Race Reports' : 'レースレポート・口コミ'}
          </CardTitle>
          <Badge variant="outline" className="text-[10px] border-amber-300 bg-amber-50 text-amber-700">
            {isEn ? 'Beta — Free during testing period' : 'β版 — テスト期間中は無料'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">
            {isEn ? 'Loading...' : '読み込み中...'}
          </p>
        ) : comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {isEn ? 'No reports yet. Be the first!' : 'まだレポートはありません。最初の投稿者になりましょう！'}
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

        {canPost && user ? (
          <div className="mt-6 border-t border-border pt-4">
            {/* Posting Guidelines */}
            <div className="mb-4 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground/80">
                {isEn ? 'Posting Guidelines' : '投稿ガイドライン'}
              </p>
              {isEn ? (
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>Share your race experience, course tips, or logistics advice</li>
                  <li>Spam, abusive content, and promotional posts will be removed</li>
                  <li>Posts are public and cannot be edited after submission</li>
                  <li>This feature is free during the beta period — posting conditions may change in the future</li>
                </ul>
              ) : (
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>レース体験・コース情報・ロジスティクスのアドバイスを共有してください</li>
                  <li>スパム・誹謗中傷・宣伝目的の投稿は削除されます</li>
                  <li>投稿は公開され、送信後の編集はできません</li>
                  <li>β版期間中は無料です — 将来、投稿条件が変更される場合があります</li>
                </ul>
              )}
            </div>
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
              {error && <p className="text-xs text-destructive">{error}</p>}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{content.length}/5000</span>
                <Button
                  size="sm"
                  disabled={submitting || !content.trim()}
                  onClick={handlePublish}
                >
                  {submitting ? (
                    <><Loader2 className="mr-1 h-3 w-3 animate-spin" />{isEn ? 'Posting...' : '投稿中...'}</>
                  ) : (
                    <><Send className="mr-1 h-3 w-3" />{isEn ? 'Post' : '投稿する'}</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        ) : canPost ? (
          <div className="mt-6 border-t border-border pt-4 text-center">
            <p className="text-sm text-muted-foreground">
              {isEn ? 'Sign in to post a race report.' : 'ログインしてレースレポートを投稿しましょう。'}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default EventComments
