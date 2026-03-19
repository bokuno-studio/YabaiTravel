import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function EventCardSkeleton() {
  return (
    <Card className="overflow-hidden border-border/50 bg-card">
      <CardContent className="p-0">
        {/* Image Placeholder */}
        <Skeleton className="h-32 w-full rounded-none" />

        <div className="space-y-4 p-4">
          {/* Event Name */}
          <Skeleton className="h-6 w-3/4" />

          {/* Event Details */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-28" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>

          {/* Cost Estimate */}
          <div className="rounded-lg bg-secondary/50 p-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-6 w-40" />
            <Skeleton className="mt-2 h-3 w-32" />
          </div>

          {/* Button */}
          <Skeleton className="h-10 w-full" />
        </div>
      </CardContent>
    </Card>
  )
}
