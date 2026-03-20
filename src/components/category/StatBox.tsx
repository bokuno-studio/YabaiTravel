/** Quick stat box for the top grid */
function StatBox({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex flex-col items-center rounded-lg bg-secondary/50 p-3 text-center">
      <span className="text-primary/70">{icon}</span>
      <span className="mt-1 text-base font-bold text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

export default StatBox
