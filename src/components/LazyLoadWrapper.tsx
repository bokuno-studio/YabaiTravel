import { useEffect, useRef, useState, type ReactNode } from 'react'

interface LazyLoadWrapperProps {
  children: ReactNode
  /** Placeholder to show before the component becomes visible */
  placeholder?: ReactNode
  /** IntersectionObserver rootMargin (default: load 200px before entering viewport) */
  rootMargin?: string
  /** Minimum height for the placeholder container to prevent CLS */
  minHeight?: string
  /** CSS class for the wrapper div */
  className?: string
}

/**
 * Defers rendering of children until the element scrolls into (or near) the viewport.
 * Uses IntersectionObserver for efficient scroll detection.
 */
export default function LazyLoadWrapper({
  children,
  placeholder,
  rootMargin = '200px',
  minHeight,
  className,
}: LazyLoadWrapperProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [rootMargin])

  return (
    <div ref={ref} className={className} style={minHeight ? { minHeight } : undefined}>
      {isVisible ? children : (placeholder ?? null)}
    </div>
  )
}
