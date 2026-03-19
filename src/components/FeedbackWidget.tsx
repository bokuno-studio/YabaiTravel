import { useState, useEffect } from 'react'
import { MessageSquare, X, Loader2, Lightbulb, Bug, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'

function FeedbackWidget() {
  const { user, isSupporter } = useAuth()
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState('')
  const [type, setType] = useState<'feature' | 'bug'>('feature')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  // Auto-close after success
  useEffect(() => {
    if (!success) return
    const timer = setTimeout(() => {
      setSuccess(false)
      setOpen(false)
    }, 2000)
    return () => clearTimeout(timer)
  }, [success])

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
          channel: 'widget',
        }),
      })
      if (!res.ok) {
        const json = await res.json()
        setError(json.error || '送信に失敗しました')
        return
      }
      setContent('')
      setType('feature')
      setSuccess(true)
    } catch {
      setError('送信に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
        >
          <MessageSquare className="size-4" />
          フィードバック
        </button>
      )}

      {/* Popup */}
      {open && (
        <div className="fixed bottom-4 right-4 z-50 w-80 rounded-xl border bg-background shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">フィードバック</h3>
            <button
              onClick={() => {
                setOpen(false)
                setSuccess(false)
              }}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="p-4">
            {success ? (
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <CheckCircle className="size-10 text-green-500" />
                <p className="font-medium">送信しました！</p>
                <p className="text-xs text-muted-foreground">
                  フィードバックありがとうございます
                </p>
              </div>
            ) : (
              <>
                {/* Type selector */}
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setType('feature')}
                    className={cn(
                      'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs border transition-colors',
                      type === 'feature'
                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                        : 'border-border text-muted-foreground hover:border-blue-200'
                    )}
                  >
                    <Lightbulb className="size-3" />
                    要望
                  </button>
                  {isSupporter && (
                    <button
                      onClick={() => setType('bug')}
                      className={cn(
                        'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs border transition-colors',
                        type === 'bug'
                          ? 'border-red-300 bg-red-50 text-red-700'
                          : 'border-border text-muted-foreground hover:border-red-200'
                      )}
                    >
                      <Bug className="size-3" />
                      バグ
                    </button>
                  )}
                </div>

                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[80px] resize-y"
                  placeholder="どんな改善があると嬉しいですか？"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />

                {error && (
                  <p className="mt-1 text-xs text-destructive">{error}</p>
                )}

                <div className="mt-3 flex justify-end">
                  <Button
                    size="sm"
                    onClick={handleSubmit}
                    disabled={!content.trim() || submitting}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="size-3 animate-spin" />
                        送信中...
                      </>
                    ) : (
                      '送信'
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export default FeedbackWidget
