interface Props { remaining: number; isEn: boolean }

function ViewLimitBadge({ remaining, isEn }: Props) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 border border-amber-200">
      {isEn ? `${remaining} free views left this month` : `無料閲覧 残り${remaining}本`}
    </div>
  )
}

export default ViewLimitBadge
