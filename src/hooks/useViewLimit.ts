import { useState, useMemo, useCallback } from 'react'
import { useAuth } from '@/lib/auth'

const GUEST_VIEW_LIMIT = 10
const FREE_VIEW_LIMIT = 30
const STORAGE_KEY = 'yabai_view_count'

interface ViewCount {
  month: string
  count: number
}

function getStoredCount(): number {
  if (typeof window === 'undefined') return 0
  const currentMonth = new Date().toISOString().slice(0, 7)
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as ViewCount
      if (parsed.month === currentMonth) return parsed.count
    }
  } catch { /* ignore */ }
  return 0
}

export function useViewLimit() {
  const { user, isSupporter } = useAuth()
  const [count, setCount] = useState(() => getStoredCount())

  const viewLimit = isSupporter ? Infinity : user ? FREE_VIEW_LIMIT : GUEST_VIEW_LIMIT
  const remaining = useMemo(() => Math.max(0, viewLimit - count), [viewLimit, count])
  const isLimited = useMemo(() => !isSupporter && count >= viewLimit, [isSupporter, viewLimit, count])

  const increment = useCallback(() => {
    if (isSupporter) return
    const currentMonth = new Date().toISOString().slice(0, 7)
    const newCount = getStoredCount() + 1
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ month: currentMonth, count: newCount }))
    setCount(newCount)
  }, [isSupporter])

  return { remaining, isLimited, increment, isSupporter, viewLimit }
}
