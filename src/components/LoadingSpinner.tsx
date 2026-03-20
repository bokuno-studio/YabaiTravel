import { Loader2 } from 'lucide-react'

/** Simple loading spinner used as Suspense fallback for lazy-loaded pages */
function LoadingSpinner() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
      <span className="sr-only">Loading...</span>
    </div>
  )
}

export default LoadingSpinner
