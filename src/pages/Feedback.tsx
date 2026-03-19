import { useParams, Link } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { Helmet } from 'react-helmet-async'
import {
  ChevronUp,
  MessageSquare,
  ExternalLink,
  Plus,
  X,
  Send,
  Loader2,
  Bug,
  Lightbulb,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'

/* ---------- types ---------- */

interface Feedback {
  id: string
  content: string
  feedback_type: 'feature' | 'bug'
  status: 'new' | 'in_progress' | 'resolved'
  vote_count: number
  github_issue_url: string | null
  source_url: string | null
  user_id: string | null
  created_at: string
}

interface FeedbackComment {
  id: string
  feedback_id: string
  user_id: string
  content: string
  created_at: string
}

/* ---------- helpers ---------- */

function getVoterId(): string {
  const key = 'yabai_voter_id'
  let id = localStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(key, id)
  }
  return id
}

function getVotedSet(): Set<string> {
  try {
    const raw = localStorage.getItem('yabai_voted_ids')
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

function markVoted(feedbackId: string) {
  const set = getVotedSet()
  set.add(feedbackId)
  localStorage.setItem('yabai_voted_ids', JSON.stringify([...set]))
}

type TypeFilter = 'all' | 'feature' | 'bug'
type StatusFilter = 'all' | 'new' | 'in_progress' | 'resolved'

const STATUS_LABEL: Record<string, string> = {
  new: '新規',
  in_progress: '対応中',
  resolved: '解決済み',
}

const STATUS_COLOR: Record<string, string> = {
  new: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-yellow-100 text-yellow-800',
  resolved: 'bg-green-100 text-green-800',
}

/* ---------- sub-components ---------- */

function VoteButton({
  count,
  voted,
  onClick,
}: {
  count: number
  voted: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={voted}
      className={cn(
        'flex flex-col items-center justify-center gap-0.5 rounded-lg border px-3 py-2 text-sm transition-colors',
        voted
          ? 'border-primary/30 bg-primary/10 text-primary cursor-default'
          : 'border-border hover:border-primary/40 hover:bg-primary/5 text-muted-foreground'
      )}
    >
      <ChevronUp className="size-4" />
      <span className="font-semibold leading-none">{count}</span>
    </button>
  )
}

function TypeBadge({ type }: { type: 'feature' | 'bug' }) {
  if (type === 'bug') {
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200">
        <Bug className="size-3" />
        バグ
      </Badge>
    )
  }
  return (
    <Badge className="bg-blue-100 text-blue-700 border-blue-200">
      <Lightbulb className="size-3" />
      要望
    </Badge>
  )
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={cn('border-transparent', STATUS_COLOR[status] || '')}>
      {STATUS_LABEL[status] || status}
    </Badge>
  )
}

function CommentSection({
  feedbackId,
  lang,
}: {
  feedbackId: string
  lang: string
}) {
  const { user, session, isSupporter } = useAuth()
  const [comments, setComments] = useState<FeedbackComment[]>([])
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadComments = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/feedback-comment?feedback_id=${feedbackId}`)
      const json = await res.json()
      setComments(json.data || [])
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [feedbackId])

  useEffect(() => {
    if (expanded) loadComments()
  }, [expanded, loadComments])

  const handleSubmitComment = async () => {
    if (!commentText.trim() || !session?.access_token) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/feedback-comment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          feedback_id: feedbackId,
          content: commentText.trim(),
        }),
      })
      if (res.ok) {
        setCommentText('')
        loadComments()
      }
    } catch {
      /* ignore */
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <MessageSquare className="size-3.5" />
        <span>コメント{comments.length > 0 ? ` (${comments.length})` : ''}</span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              読み込み中...
            </div>
          ) : comments.length === 0 ? (
            <p className="text-xs text-muted-foreground">コメントはまだありません</p>
          ) : (
            <div className="space-y-2">
              {comments.map((c) => (
                <div
                  key={c.id}
                  className="rounded-md bg-muted/50 px-3 py-2 text-sm"
                >
                  <p>{c.content}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString('ja-JP')}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Comment input */}
          {user && isSupporter ? (
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="コメントを入力..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmitComment()
                  }
                }}
              />
              <Button
                size="sm"
                onClick={handleSubmitComment}
                disabled={!commentText.trim() || submitting}
              >
                {submitting ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Send className="size-3" />
                )}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              <Link
                to={`/${lang}/pricing`}
                className="text-primary underline hover:no-underline"
              >
                応援メンバーになるとコメントできます
              </Link>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/* ---------- New feedback form ---------- */

function NewFeedbackForm({
  isSupporter,
  onSubmitted,
  onClose,
}: {
  isSupporter: boolean
  onSubmitted: () => void
  onClose: () => void
}) {
  const { user } = useAuth()
  const [content, setContent] = useState('')
  const [type, setType] = useState<'feature' | 'bug'>('feature')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!content.trim()) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: content.trim(),
          feedback_type: type,
          source_url: window.location.href,
          user_id: user?.id || null,
          channel: 'web',
        }),
      })
      if (!res.ok) {
        const json = await res.json()
        setError(json.error || '送信に失敗しました')
        return
      }
      onSubmitted()
      onClose()
    } catch {
      setError('送信に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative mx-4 w-full max-w-lg rounded-xl border bg-background p-6 shadow-lg">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
        >
          <X className="size-5" />
        </button>

        <h2 className="text-lg font-semibold mb-4">フィードバックを投稿</h2>

        {/* Type selector */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setType('feature')}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm border transition-colors',
              type === 'feature'
                ? 'border-blue-300 bg-blue-50 text-blue-700'
                : 'border-border text-muted-foreground hover:border-blue-200'
            )}
          >
            <Lightbulb className="size-3.5" />
            要望
          </button>
          {isSupporter && (
            <button
              onClick={() => setType('bug')}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm border transition-colors',
                type === 'bug'
                  ? 'border-red-300 bg-red-50 text-red-700'
                  : 'border-border text-muted-foreground hover:border-red-200'
              )}
            >
              <Bug className="size-3.5" />
              バグ
            </button>
          )}
        </div>

        <textarea
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[120px] resize-y"
          placeholder="どんな改善があると嬉しいですか？"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />

        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            キャンセル
          </Button>
          <Button onClick={handleSubmit} disabled={!content.trim() || submitting}>
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                送信中...
              </>
            ) : (
              '投稿する'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ---------- main page ---------- */

function Feedback() {
  const { lang } = useParams<{ lang: string }>()
  const isEn = lang === 'en'
  const { isSupporter } = useAuth()

  const [feedbacks, setFeedbacks] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [showForm, setShowForm] = useState(false)
  const [votedIds, setVotedIds] = useState<Set<string>>(getVotedSet)

  const fetchFeedbacks = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (typeFilter !== 'all') params.set('type', typeFilter)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const res = await fetch(`/api/feedback?${params}`)
      const json = await res.json()
      const data: Feedback[] = json.data || []
      // Sort by vote_count desc, then created_at desc
      data.sort((a, b) => {
        if (b.vote_count !== a.vote_count) return b.vote_count - a.vote_count
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
      setFeedbacks(data)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [typeFilter, statusFilter])

  useEffect(() => {
    fetchFeedbacks()
  }, [fetchFeedbacks])

  const handleVote = async (feedbackId: string) => {
    if (votedIds.has(feedbackId)) return
    const voterId = getVoterId()
    try {
      const res = await fetch('/api/feedback-vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback_id: feedbackId, voter_id: voterId }),
      })
      if (res.ok || res.status === 409) {
        markVoted(feedbackId)
        setVotedIds(getVotedSet())
        // Optimistically update count
        setFeedbacks((prev) =>
          prev.map((f) =>
            f.id === feedbackId ? { ...f, vote_count: f.vote_count + (res.ok ? 1 : 0) } : f
          )
        )
      }
    } catch {
      /* ignore */
    }
  }

  // Filter out bug feedbacks for non-supporters
  const visibleFeedbacks = feedbacks.filter(
    (f) => f.feedback_type !== 'bug' || isSupporter
  )

  return (
    <>
      <Helmet>
        <title>
          {isEn ? 'Community Board | yabai.travel' : 'コミュニティ掲示板 | yabai.travel'}
        </title>
        <meta
          name="description"
          content={
            isEn
              ? 'Community board for feature requests and discussions.'
              : 'コミュニティメンバーによる要望・議論の場です。'
          }
        />
      </Helmet>

      <div className="mx-auto max-w-3xl px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold">
            {isEn ? 'Community Board' : 'コミュニティ掲示板'}
          </h1>
          {isSupporter ? (
            <Button onClick={() => setShowForm(true)}>
              <Plus className="size-4" />
              {isEn ? 'Post' : '投稿する'}
            </Button>
          ) : null}
        </div>
        {!isSupporter && (
          <p className="text-sm text-muted-foreground mb-4">
            {isEn
              ? 'Only community members who help grow this platform can participate here.'
              : 'コミュニティを育ててくれるメンバーだけがここに参加できます。'}
            {' '}
            <Link to={`/${lang}/pricing`} className="text-primary underline hover:no-underline">
              {isEn ? 'Become a member' : 'メンバーになる'}
            </Link>
          </p>
        )}

        {/* Filter chips */}
        <div className="flex flex-wrap gap-2 mb-6">
          {/* Type filters */}
          <div className="flex gap-1">
            {(['all', 'feature', 'bug'] as const)
              .filter((t) => t !== 'bug' || isSupporter)
              .map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={cn(
                    'rounded-full px-3 py-1 text-sm border transition-colors',
                    typeFilter === t
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  )}
                >
                  {t === 'all' ? 'すべて' : t === 'feature' ? '要望' : 'バグ'}
                </button>
              ))}
          </div>

          <span className="text-border">|</span>

          {/* Status filters */}
          <div className="flex gap-1">
            {(['all', 'new', 'in_progress', 'resolved'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  'rounded-full px-3 py-1 text-sm border transition-colors',
                  statusFilter === s
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-border text-muted-foreground hover:bg-muted'
                )}
              >
                {s === 'all' ? '全ステータス' : STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Feedback list */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4 animate-pulse">
                <div className="flex gap-4">
                  <div className="w-12 h-16 bg-muted rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-4 bg-muted rounded w-1/2" />
                    <div className="h-3 bg-muted rounded w-1/4" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : visibleFeedbacks.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MessageSquare className="size-12 mx-auto mb-3 opacity-30" />
            <p>フィードバックはまだありません</p>
            <p className="text-sm mt-1">最初の投稿をしてみましょう！</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleFeedbacks.map((fb) => (
              <Card key={fb.id} className="p-4">
                <div className="flex gap-4">
                  {/* Vote button */}
                  <VoteButton
                    count={fb.vote_count}
                    voted={votedIds.has(fb.id)}
                    onClick={() => handleVote(fb.id)}
                  />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                      {fb.content}
                    </p>

                    {/* Badges */}
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <TypeBadge type={fb.feedback_type} />
                      <StatusBadge status={fb.status} />
                      {fb.github_issue_url && (
                        <a
                          href={fb.github_issue_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <ExternalLink className="size-3" />
                          GitHub Issue
                        </a>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">
                        {new Date(fb.created_at).toLocaleDateString('ja-JP')}
                      </span>
                    </div>

                    {/* Comments */}
                    <CommentSection feedbackId={fb.id} lang={lang || 'ja'} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* New feedback modal */}
      {showForm && (
        <NewFeedbackForm
          isSupporter={isSupporter}
          onSubmitted={fetchFeedbacks}
          onClose={() => setShowForm(false)}
        />
      )}
    </>
  )
}

export default Feedback
