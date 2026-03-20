import { useState } from 'react'
import { Pencil, Check, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ChangeRequestButtonProps {
  eventId: string
  categoryId?: string
  fieldName: string
  currentValue?: string | null
}

function ChangeRequestButton({ eventId, categoryId, fieldName, currentValue }: ChangeRequestButtonProps) {
  const [open, setOpen] = useState(false)
  const [suggestedValue, setSuggestedValue] = useState('')
  const [reason, setReason] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')

  const handleSubmit = async () => {
    if (!suggestedValue.trim()) return
    setStatus('submitting')
    try {
      const res = await fetch('/api/change-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          category_id: categoryId || undefined,
          field_name: fieldName,
          current_value: currentValue || undefined,
          suggested_value: suggestedValue.trim(),
          reason: reason.trim() || undefined,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      setStatus('success')
      setTimeout(() => {
        setOpen(false)
        setStatus('idle')
        setSuggestedValue('')
        setReason('')
      }, 1500)
    } catch {
      setStatus('error')
    }
  }

  const handleClose = () => {
    if (status === 'submitting') return
    setOpen(false)
    setStatus('idle')
    setSuggestedValue('')
    setReason('')
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-xs text-muted-foreground/60 transition-colors hover:text-primary hover:bg-primary/5"
        title="修正提案"
      >
        <Pencil className="h-3 w-3" />
        <span className="hidden sm:inline">修正提案</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
        >
          <div className="w-full max-w-md rounded-xl border bg-background p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">修正提案</h3>
              <button type="button" onClick={handleClose} className="rounded p-1 text-muted-foreground hover:bg-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>

            {status === 'success' ? (
              <div className="flex flex-col items-center gap-2 py-8">
                <Check className="h-8 w-8 text-emerald-600" />
                <p className="text-sm font-medium text-emerald-700">提案を送信しました</p>
              </div>
            ) : (
              <>
                <div className="mb-3">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">項目</label>
                  <input
                    type="text"
                    readOnly
                    value={fieldName}
                    className="w-full rounded-md border bg-secondary/50 px-3 py-1.5 text-sm text-muted-foreground"
                  />
                </div>

                {currentValue && (
                  <div className="mb-3">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">現在の値</label>
                    <input
                      type="text"
                      readOnly
                      value={currentValue}
                      className="w-full rounded-md border bg-secondary/50 px-3 py-1.5 text-sm text-muted-foreground"
                    />
                  </div>
                )}

                <div className="mb-3">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    正しい値 <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={suggestedValue}
                    onChange={(e) => setSuggestedValue(e.target.value)}
                    placeholder="正しいと思われる値を入力してください"
                    rows={3}
                    className="w-full rounded-md border px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="mb-4">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    理由（任意）
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="修正の根拠や参照元を教えてください"
                    rows={2}
                    className="w-full rounded-md border px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                {status === 'error' && (
                  <p className="mb-3 text-xs text-red-600">送信に失敗しました。もう一度お試しください。</p>
                )}

                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={handleClose} disabled={status === 'submitting'}>
                    キャンセル
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSubmit}
                    disabled={!suggestedValue.trim() || status === 'submitting'}
                  >
                    {status === 'submitting' ? (
                      <>
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
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

export default ChangeRequestButton
