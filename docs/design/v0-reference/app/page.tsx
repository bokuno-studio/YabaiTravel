'use client'

import { useState, useMemo, useEffect } from 'react'
import { Header } from '@/components/header'
import { FiltersSidebar } from '@/components/filters-sidebar'
import { EventCard } from '@/components/event-card'
import { EventCardSkeleton } from '@/components/event-card-skeleton'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { SlidersHorizontal, LayoutGrid, List } from 'lucide-react'
import { events } from '@/lib/data'
import type { RaceType } from '@/lib/types'
import { cn } from '@/lib/utils'

export default function EventListPage() {
  const [locale, setLocale] = useState<'en' | 'ja'>('en')
  const [isLoading, setIsLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  
  // Filter states
  const [selectedRaceTypes, setSelectedRaceTypes] = useState<RaceType[]>([])
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)
  const [distanceRange, setDistanceRange] = useState<[number, number]>([0, 200])
  const [costRange, setCostRange] = useState<[number, number]>([0, 150000])
  const [showAcceptingOnly, setShowAcceptingOnly] = useState(false)

  // Simulate loading
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 800)
    return () => clearTimeout(timer)
  }, [])

  const handleRaceTypeToggle = (type: RaceType) => {
    setSelectedRaceTypes(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type)
        : [...prev, type]
    )
  }

  // Parse distance from string to number (e.g., "165km" -> 165)
  const parseDistance = (distanceStr: string): number => {
    const match = distanceStr.match(/(\d+)/)
    return match ? parseInt(match[1], 10) : 0
  }

  // Filter events based on all criteria
  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      // Race type filter
      if (selectedRaceTypes.length > 0 && !selectedRaceTypes.includes(event.raceType)) {
        return false
      }

      // Month filter
      if (selectedMonth !== null) {
        const eventMonth = new Date(event.date).getMonth() + 1
        if (eventMonth !== selectedMonth) return false
      }

      // Distance filter - check if any category falls within range
      const eventDistances = event.categories.map(c => parseDistance(c.distance))
      const maxDistance = Math.max(...eventDistances)
      if (maxDistance < distanceRange[0] || (distanceRange[1] < 200 && maxDistance > distanceRange[1])) {
        return false
      }

      // Cost filter
      if (event.estimatedTotalCost) {
        if (event.estimatedTotalCost.min > costRange[1] || event.estimatedTotalCost.max < costRange[0]) {
          return false
        }
      }

      // Entry status filter
      if (showAcceptingOnly && event.entryStatus !== 'accepting') {
        return false
      }

      return true
    })
  }, [selectedRaceTypes, selectedMonth, distanceRange, costRange, showAcceptingOnly])

  const FilterContent = () => (
    <FiltersSidebar
      locale={locale}
      selectedRaceTypes={selectedRaceTypes}
      onRaceTypeToggle={handleRaceTypeToggle}
      selectedMonth={selectedMonth}
      onMonthChange={setSelectedMonth}
      distanceRange={distanceRange}
      onDistanceRangeChange={setDistanceRange}
      costRange={costRange}
      onCostRangeChange={setCostRange}
      showAcceptingOnly={showAcceptingOnly}
      onShowAcceptingOnlyChange={setShowAcceptingOnly}
    />
  )

  return (
    <div className="min-h-screen bg-background">
      <Header locale={locale} onLocaleChange={setLocale} />
      
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            {locale === 'ja' ? 'レースイベント' : 'Race Events'}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {locale === 'ja' 
              ? 'トレイルランニング、HYROX、スパルタンレース、マラソンなどのイベントを探す' 
              : 'Find trail running, HYROX, Spartan Race, marathon and more'}
          </p>
        </div>

        <div className="flex gap-8">
          {/* Desktop Sidebar */}
          <div className="hidden lg:block">
            <div className="sticky top-24 rounded-xl border border-border bg-card p-6">
              <FilterContent />
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            {/* Toolbar */}
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* Mobile Filter Button */}
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="sm" className="lg:hidden">
                      <SlidersHorizontal className="mr-2 h-4 w-4" />
                      {locale === 'ja' ? 'フィルター' : 'Filters'}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-80 overflow-y-auto">
                    <SheetHeader>
                      <SheetTitle>{locale === 'ja' ? 'フィルター' : 'Filters'}</SheetTitle>
                    </SheetHeader>
                    <div className="mt-6">
                      <FilterContent />
                    </div>
                  </SheetContent>
                </Sheet>
                
                <span className="text-sm text-muted-foreground">
                  {filteredEvents.length} {locale === 'ja' ? '件のイベント' : 'events'}
                </span>
              </div>

              {/* View Mode Toggle */}
              <div className="flex items-center rounded-lg border border-border bg-secondary/50 p-0.5">
                <button
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    'rounded-md p-2 transition-colors',
                    viewMode === 'grid'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  aria-label="Grid view"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={cn(
                    'rounded-md p-2 transition-colors',
                    viewMode === 'list'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  aria-label="List view"
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Event Grid/List */}
            {isLoading ? (
              <div className={cn(
                'grid gap-6',
                viewMode === 'grid' 
                  ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3' 
                  : 'grid-cols-1'
              )}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <EventCardSkeleton key={i} />
                ))}
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16">
                <div className="text-center">
                  <p className="text-lg font-medium text-foreground">
                    {locale === 'ja' ? 'イベントが見つかりません' : 'No events found'}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {locale === 'ja' 
                      ? 'フィルターを調整してみてください' 
                      : 'Try adjusting your filters'}
                  </p>
                </div>
              </div>
            ) : (
              <div className={cn(
                'grid gap-6',
                viewMode === 'grid' 
                  ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3' 
                  : 'grid-cols-1'
              )}>
                {filteredEvents.map((event) => (
                  <EventCard key={event.id} event={event} locale={locale} />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
