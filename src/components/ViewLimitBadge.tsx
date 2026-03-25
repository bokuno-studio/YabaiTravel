const VIEW_LIMIT = 10

interface Props { remaining: number; isEn: boolean }

function ViewLimitBadge({ remaining, isEn }: Props) {
  const viewed = VIEW_LIMIT - remaining
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 border border-amber-200">
      {isEn ? `${viewed}/${VIEW_LIMIT} viewed this month` : `今月 ${viewed}/${VIEW_LIMIT} 本閲覧済み`}
    </div>
  )
}

export default ViewLimitBadge
