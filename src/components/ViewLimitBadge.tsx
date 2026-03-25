interface Props { remaining: number; isEn: boolean; viewLimit: number }

function ViewLimitBadge({ remaining, isEn, viewLimit }: Props) {
  const viewed = viewLimit - remaining
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 border border-amber-200">
      {isEn ? `${viewed}/${viewLimit} viewed this month` : `今月 ${viewed}/${viewLimit} 本閲覧済み`}
    </div>
  )
}

export default ViewLimitBadge
