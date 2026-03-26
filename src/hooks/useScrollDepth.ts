import { useEffect, useRef } from 'react'
import { trackScrollDepth } from '@/lib/analytics'

export function useScrollDepth(pageType: string) {
  const firedRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    const thresholds = [25, 50, 75, 90]
    const handler = () => {
      const scrollPercent = Math.round(
        (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100
      )
      for (const t of thresholds) {
        if (scrollPercent >= t && !firedRef.current.has(t)) {
          firedRef.current.add(t)
          trackScrollDepth(t, window.location.pathname, pageType)
        }
      }
    }
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [pageType])
}
