import { useState, useMemo, useCallback } from 'react'
import { useAuth } from '@/lib/auth'

const VIEW_LIMIT = 10
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
  const { isSupporter } = useAuth()
  const [count, setCount] = useState(getStoredCount)

  const remaining = useMemo(() => isSupporter ? Infinity : Math.max(0, VIEW_LIMIT - count), [isSupporter, count])
  const isLimited = useMemo(() => !isSupporter && count >= VIEW_LIMIT, [isSupporter, count])

  const increment = useCallback(() => {
    if (isSupporter) return
    const currentMonth = new Date().toISOString().slice(0, 7)
    const newCount = getStoredCount() + 1
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ month: currentMonth, count: newCount }))
    setCount(newCount)
  }, [isSupporter])

  return { remaining, isLimited, increment, isSupporter }
}
