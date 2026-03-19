import { useState, useEffect } from 'react'
import { Bug, X, Loader2, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'

function FeedbackWidget() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

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
          feedback_type: 'bug',
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
      setSuccess(true)
    } catch {
      setError('送信に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-red-500 px-4 py-2.5 text-sm font-medium text-white shadow-lg hover:bg-red-600 transition-colors"
        >
          <Bug className="size-4" />
          バグ報告
        </button>
      )}

      {open && (
        <div className="fixed bottom-4 right-4 z-50 w-80 rounded-xl border bg-background shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">バグ報告</h3>
            <button
              onClick={() => { setOpen(false); setSuccess(false) }}
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
                <p className="text-xs text-muted-foreground">報告ありがとうございます</p>
              </div>
            ) : (
              <>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[80px] resize-y"
                  placeholder="どこで何が起きましたか？"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
                {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
                <div className="mt-3 flex justify-end">
                  <Button size="sm" onClick={handleSubmit} disabled={!content.trim() || submitting}>
                    {submitting ? (<><Loader2 className="size-3 animate-spin" />送信中...</>) : '送信'}
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
