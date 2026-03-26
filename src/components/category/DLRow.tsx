import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DLRowProps {
  label: string
  value: string | number | null | undefined
  multiline?: boolean
  eventId?: string
  categoryId?: string
}

/** Helper to render a definition list row */
function DLRow({ label, value, multiline, eventId, categoryId }: DLRowProps) {
  const { lang } = useParams<{ lang?: string }>()
  const isEn = lang === 'en'
  const displayValue = value != null ? String(value) : null

  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn(
        'flex items-start gap-1',
        !displayValue || displayValue === '\u2014' ? 'italic text-muted-foreground/60' : '',
        multiline && 'whitespace-pre-wrap',
      )}>
        <span className="flex-1">{displayValue ?? '\u2014'}</span>
        {eventId && (
          <DLRowPencil
            eventId={eventId}
            categoryId={categoryId}
            fieldName={label}
            currentValue={displayValue}
            isEn={isEn}
          />
        )}
      </dd>
    </>
  )
}

/** Inline pencil that opens the ChangeRequest modal */
function DLRowPencil({
  eventId,
  categoryId,
  fieldName,
  currentValue,
  isEn,
}: {
  eventId: string
  categoryId?: string
  fieldName: string
  currentValue: string | null
  isEn: boolean
}) {
  const [showModal, setShowModal] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="mt-0.5 shrink-0 text-muted-foreground/50 transition-colors hover:text-muted-foreground"
        title={isEn ? 'Suggest a correction' : '修正提案'}
      >
        <Pencil className="h-3 w-3" />
      </button>
      {showModal && (
        <ChangeRequestModal
          eventId={eventId}
          categoryId={categoryId}
          fieldName={fieldName}
          currentValue={currentValue}
          isEn={isEn}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}

/** Reuses ChangeRequestButton's modal logic inline */
function ChangeRequestModal({
  eventId,
  categoryId,
  fieldName,
  currentValue,
  isEn,
  onClose,
}: {
  eventId: string
  categoryId?: string
  fieldName: string
  currentValue: string | null
  isEn: boolean
  onClose: () => void
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md rounded-xl border bg-background p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <ChangeRequestInlineForm
          eventId={eventId}
          categoryId={categoryId}
          fieldName={fieldName}
          currentValue={currentValue}
          isEn={isEn}
          onClose={onClose}
        />
      </div>
    </div>,
    document.body,
  )
}

function ChangeRequestInlineForm({
  eventId,
  categoryId,
  fieldName,
  currentValue,
  isEn,
  onClose,
}: {
  eventId: string
  categoryId?: string
  fieldName: string
  currentValue: string | null
  isEn: boolean
  onClose: () => void
}) {
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
      setTimeout(() => onClose(), 1500)
    } catch {
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div className="flex flex-col items-center gap-2 py-8">
        <span className="text-2xl">&#10003;</span>
        <p className="text-sm font-medium text-emerald-700">{isEn ? 'Suggestion submitted' : '提案を送信しました'}</p>
      </div>
    )
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold">{isEn ? 'Suggest a correction' : '修正提案'}</h3>
        <button type="button" onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-secondary">
          &#10005;
        </button>
      </div>

      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-muted-foreground">{isEn ? 'Field' : '項目'}</label>
        <input type="text" readOnly value={fieldName} className="w-full rounded-md border bg-secondary/50 px-3 py-1.5 text-sm text-muted-foreground" />
      </div>

      {currentValue && (
        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">{isEn ? 'Current value' : '現在の値'}</label>
          <input type="text" readOnly value={currentValue} className="w-full rounded-md border bg-secondary/50 px-3 py-1.5 text-sm text-muted-foreground" />
        </div>
      )}

      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          {isEn ? 'Correct value' : '正しい値'} <span className="text-red-500">*</span>
        </label>
        <textarea
          value={suggestedValue}
          onChange={(e) => setSuggestedValue(e.target.value)}
          placeholder={isEn ? 'Enter the correct value' : '正しいと思われる値を入力してください'}
          rows={3}
          className="w-full rounded-md border px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-xs font-medium text-muted-foreground">{isEn ? 'Reason (optional)' : '理由（任意）'}</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={isEn ? 'Please share the source or reason for this correction' : '修正の根拠や参照元を教えてください'}
          rows={2}
          className="w-full rounded-md border px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {status === 'error' && (
        <p className="mb-3 text-xs text-red-600">{isEn ? 'Submission failed. Please try again.' : '送信に失敗しました。もう一度お試しください。'}</p>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-md border px-3 py-1.5 text-sm hover:bg-secondary" disabled={status === 'submitting'}>
          {isEn ? 'Cancel' : 'キャンセル'}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!suggestedValue.trim() || status === 'submitting'}
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {status === 'submitting' ? (isEn ? 'Submitting...' : '送信中...') : (isEn ? 'Submit' : '送信')}
        </button>
      </div>
    </>
  )
}

export default DLRow
