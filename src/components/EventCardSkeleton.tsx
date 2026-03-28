import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function EventCardSkeleton() {
  return (
    <Card className="overflow-hidden border-t-4 border-t-gray-200 shadow-sm py-0 flex flex-col min-h-[220px]">
      <CardContent className="flex flex-1 flex-col p-0">
        <div className="flex h-full flex-col p-4">
          {/* 1. Race type badge */}
          <div className="mb-2">
            <Skeleton className="h-5 w-14 rounded-md" />
          </div>

          {/* 2. Event name (2 lines) */}
          <Skeleton className="h-4 w-full mb-1" />
          <Skeleton className="h-4 w-3/4 mb-2" />

          {/* 3-4. Date and Location */}
          <div className="space-y-1 mb-auto">
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-3 w-3 rounded-full shrink-0" />
              <Skeleton className="h-3 w-32" />
            </div>
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-3 w-3 rounded-full shrink-0" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>

          {/* 5-6. Entry period + Cost */}
          <div className="mt-2 space-y-1">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>

        {/* 7. Category chips */}
        <div className="flex gap-1 border-t border-border/40 px-3 py-2">
          <Skeleton className="h-5 w-14 rounded-md" />
          <Skeleton className="h-5 w-16 rounded-md" />
          <Skeleton className="h-5 w-12 rounded-md" />
        </div>
      </CardContent>
    </Card>
  )
}
