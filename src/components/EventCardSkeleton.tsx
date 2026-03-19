import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function EventCardSkeleton() {
  return (
    <Card className="overflow-hidden border-solid border-border/40 shadow-sm py-0">
      <CardContent className="p-0">
        {/* Gradient image area placeholder */}
        <Skeleton className="aspect-[16/9] w-full rounded-none" />
        {/* Card body */}
        <div className="space-y-2 p-3">
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-3 w-3 rounded-full" />
            <Skeleton className="h-3 w-28" />
          </div>
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-3 w-3 rounded-full" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <div className="flex gap-1 border-t border-border/40 px-3 py-2">
          <Skeleton className="h-4 w-14 rounded-md" />
          <Skeleton className="h-4 w-16 rounded-md" />
          <Skeleton className="h-4 w-12 rounded-md" />
        </div>
      </CardContent>
    </Card>
  )
}
