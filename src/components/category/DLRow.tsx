import { cn } from '@/lib/utils'

/** Helper to render a definition list row */
function DLRow({ label, value, multiline }: { label: string; value: string | null | undefined; multiline?: boolean }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn(
        !value || value === '\u2014' ? 'italic text-muted-foreground/60' : '',
        multiline && 'whitespace-pre-wrap',
      )}>
        {value ?? '\u2014'}
      </dd>
    </>
  )
}

export default DLRow
