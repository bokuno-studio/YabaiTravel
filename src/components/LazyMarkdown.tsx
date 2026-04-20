import { lazy, Suspense } from 'react'

const MarkdownRenderer = lazy(() => import('./MarkdownRenderer'))

interface LazyMarkdownProps {
  content: string
}

export function LazyMarkdown({ content }: LazyMarkdownProps) {
  return (
    <Suspense fallback={<div className="prose prose-sm animate-pulse" />}>
      <MarkdownRenderer content={content} />
    </Suspense>
  )
}
