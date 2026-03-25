import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { trackAffiliateClick } from '@/lib/analytics'
import { Card, CardContent } from '@/components/ui/card'

interface Hotel {
  name: string
  imageUrl: string
  planUrl: string
  reviewAverage: number
  minCharge: number
  address: string
}

interface AccommodationAffiliateProps {
  lat: number
  lng: number
  isEn: boolean
  eventId: string
}

function AccommodationAffiliate({ lat, lng, isEn, eventId }: AccommodationAffiliateProps) {
  const [hotels, setHotels] = useState<Hotel[]>([])

  useEffect(() => {
    async function fetchHotels() {
      try {
        const res = await fetch(`/api/rakuten-hotels?lat=${lat}&lng=${lng}`)
        if (!res.ok) return
        const data = await res.json()
        setHotels(data.hotels || [])
      } catch { /* ignore */ }
    }
    fetchHotels()
  }, [lat, lng])

  if (hotels.length === 0) return null

  return (
    <Card className="mt-3 border-dashed">
      <CardContent className="py-3 px-4">
        <p className="text-xs font-medium text-muted-foreground mb-2">
          {isEn ? 'Nearby hotels (via Rakuten Travel)' : '周辺の宿泊施設（楽天トラベル）'}
        </p>
        <div className="space-y-2">
          {hotels.slice(0, 3).map((hotel, i) => (
            <a
              key={i}
              href={hotel.planUrl}
              target="_blank"
              rel="noreferrer noopener"
              onClick={() => trackAffiliateClick('rakuten_travel', eventId)}
              className="flex items-center gap-3 rounded-lg border p-2 text-sm hover:bg-muted/50 transition-colors"
            >
              {hotel.imageUrl && (
                <img src={hotel.imageUrl} alt="" className="h-12 w-16 rounded object-cover shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground truncate">{hotel.name}</p>
                <p className="text-xs text-muted-foreground">
                  {hotel.reviewAverage > 0 && `★${hotel.reviewAverage} · `}
                  {hotel.minCharge > 0 && `¥${hotel.minCharge.toLocaleString()}~`}
                </p>
              </div>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default AccommodationAffiliate
