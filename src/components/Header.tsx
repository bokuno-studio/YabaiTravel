interface HeaderProps {
  title: string
  subtitle: string
  lastUpdated: string | null
  weeklyNewCount: number
  statsLastUpdatedLabel: string
  statsWeeklyNewLabel: string
}

/** Format timestamptz to JST display */
function formatJST(ts: string): string {
  return new Date(ts).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
}

export function Header({
  title,
  subtitle,
  lastUpdated,
  weeklyNewCount,
  statsLastUpdatedLabel,
  statsWeeklyNewLabel,
}: HeaderProps) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
        {title}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {subtitle}
      </p>
      {(lastUpdated || weeklyNewCount > 0) && (
        <div className="mt-2 flex gap-4 text-xs text-muted-foreground/70">
          {lastUpdated && (
            <span>{statsLastUpdatedLabel}: {formatJST(lastUpdated)}</span>
          )}
          {weeklyNewCount > 0 && (
            <span>{statsWeeklyNewLabel}: {weeklyNewCount}</span>
          )}
        </div>
      )}
    </div>
  )
}
