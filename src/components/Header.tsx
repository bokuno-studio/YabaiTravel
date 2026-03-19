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
  lastUpdated,
  weeklyNewCount,
  statsLastUpdatedLabel,
  statsWeeklyNewLabel,
}: HeaderProps) {
  return (
    <>
      {(lastUpdated || weeklyNewCount > 0) && (
        <div className="mb-4 flex gap-4 text-xs text-muted-foreground/70">
          {lastUpdated && (
            <span>{statsLastUpdatedLabel}: {formatJST(lastUpdated)}</span>
          )}
          {weeklyNewCount > 0 && (
            <span>{statsWeeklyNewLabel}: {weeklyNewCount}</span>
          )}
        </div>
      )}
    </>
  )
}
