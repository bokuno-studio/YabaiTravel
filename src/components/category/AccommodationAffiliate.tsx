import { ExternalLink } from 'lucide-react'
import { trackAffiliateClick } from '@/lib/analytics'
import { Card, CardContent } from '@/components/ui/card'

interface AccommodationAffiliateProps {
  lat: number
  lng: number
  isEn: boolean
  eventId: string
}

function AccommodationAffiliate({ lat, lng, isEn, eventId }: AccommodationAffiliateProps) {
  const affiliateId = import.meta.env.VITE_RAKUTEN_AFFILIATE_ID
  if (!affiliateId) return null

  const url = `https://hb.afl.rakuten.co.jp/hgc/${affiliateId}/?pc=${encodeURIComponent(`https://travel.rakuten.co.jp/yado/map.html?lat=${lat}&lng=${lng}`)}`

  const handleClick = () => {
    trackAffiliateClick('rakuten_travel', eventId)
  }

  return (
    <Card className="mt-3 border-dashed">
      <CardContent className="py-3 px-4">
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          onClick={handleClick}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {isEn ? 'Search nearby hotels on Rakuten Travel' : '楽天トラベルで近くの宿を探す'}
        </a>
      </CardContent>
    </Card>
  )
}

export default AccommodationAffiliate
