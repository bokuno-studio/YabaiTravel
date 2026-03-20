import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/** Reusable section card wrapper */
function SectionCard({
  title,
  icon,
  action,
  children,
}: {
  title: string
  icon?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          <span className="flex-1">{title}</span>
          {action}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export default SectionCard
