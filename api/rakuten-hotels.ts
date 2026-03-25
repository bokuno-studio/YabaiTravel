import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { lat, lng } = req.query
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' })

  const appId = process.env.RAKUTEN_APP_ID
  if (!appId) return res.status(500).json({ error: 'RAKUTEN_APP_ID not configured' })

  const affiliateId = process.env.RAKUTEN_AFFILIATE_ID || ''

  try {
    const accessKey = process.env.RAKUTEN_ACCESS_KEY || ''
    const url = `https://openapi.rakuten.co.jp/engine/api/Travel/SimpleHotelSearch/20170426?applicationId=${appId}&accessKey=${accessKey}&affiliateId=${affiliateId}&latitude=${lat}&longitude=${lng}&searchRadius=3&datumType=1&hits=5&format=json`
    const response = await fetch(url, {
      headers: {
        'Referer': 'https://yabai.travel/',
        'Origin': 'https://yabai.travel',
      },
    })
    const data = await response.json()

    if (data.error) {
      return res.status(400).json({ error: data.error_description || data.error })
    }

    // 必要なフィールドだけ返す
    const hotels = (data.hotels || []).map((h: { hotel: { hotelBasicInfo: { hotelName: string; hotelImageUrl: string; planListUrl: string; reviewAverage: number; hotelMinCharge: number; address1: string; address2: string } }[] }) => {
      const info = h.hotel[0]?.hotelBasicInfo
      if (!info) return null
      return {
        name: info.hotelName,
        imageUrl: info.hotelImageUrl,
        planUrl: info.planListUrl,
        reviewAverage: info.reviewAverage,
        minCharge: info.hotelMinCharge,
        address: `${info.address1}${info.address2}`,
      }
    }).filter(Boolean)

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate')
    return res.status(200).json({ hotels })
  } catch (err) {
    console.error('Rakuten API error:', err)
    return res.status(500).json({ error: 'Failed to fetch hotels' })
  }
}
