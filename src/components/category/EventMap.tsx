import { useEffect, useRef } from 'react'
import type { AccessRoute, Accommodation } from '@/types/event'
import 'leaflet/dist/leaflet.css'

interface EventMapProps {
  latitude: number | null
  longitude: number | null
  accommodations: Accommodation[]
  accessRoutes: AccessRoute[]
  isEn: boolean
}

function EventMap({ latitude, longitude, accommodations, accessRoutes, isEn }: EventMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!mapRef.current || !latitude || !longitude) return
    if (mapInstanceRef.current) return // already initialized

    let L: typeof import('leaflet')

    import('leaflet').then((leaflet) => {
      L = leaflet.default

      // Fix default icon paths
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      })

      const map = L.map(mapRef.current!).setView([latitude, longitude], 10)
      mapInstanceRef.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map)

      // 会場マーカー（赤）
      const venueIcon = L.divIcon({
        html: '<div style="background:#ef4444;width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
        className: '',
      })
      L.marker([latitude, longitude], { icon: venueIcon })
        .addTo(map)
        .bindPopup(isEn ? 'Venue' : '会場')

      // 宿泊マーカー（青）
      const hotelIcon = L.divIcon({
        html: '<div style="background:#3b82f6;width:10px;height:10px;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>',
        iconSize: [10, 10],
        iconAnchor: [5, 5],
        className: '',
      })
      for (const a of accommodations) {
        if (a.latitude && a.longitude) {
          L.marker([a.latitude, a.longitude], { icon: hotelIcon })
            .addTo(map)
            .bindPopup(isEn ? (a.recommended_area_en ?? a.recommended_area ?? 'Hotel') : (a.recommended_area ?? 'ホテル'))
        }
      }

      // 空港・駅マーカー（緑、英語版のみ）
      if (isEn) {
        const transitIcon = L.divIcon({
          html: '<div style="background:#22c55e;width:10px;height:10px;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>',
          iconSize: [10, 10],
          iconAnchor: [5, 5],
          className: '',
        })
        for (const ar of accessRoutes) {
          if (ar.origin_type === 'venue_access' && ar.latitude && ar.longitude) {
            L.marker([ar.latitude, ar.longitude], { icon: transitIcon })
              .addTo(map)
              .bindPopup(ar.origin_name || 'Airport/Station')
          }
          // venue_access の構造化JSONから空港・駅座標を取得
          if (ar.origin_type === 'venue_access' && ar.route_detail_en) {
            try {
              const data = JSON.parse(ar.route_detail_en)
              if (data.airport_1_lat && data.airport_1_lng) {
                L.marker([data.airport_1_lat, data.airport_1_lng], { icon: transitIcon })
                  .addTo(map)
                  .bindPopup(data.airport_1_name || 'Airport')
              }
              if (data.airport_2_lat && data.airport_2_lng) {
                L.marker([data.airport_2_lat, data.airport_2_lng], { icon: transitIcon })
                  .addTo(map)
                  .bindPopup(data.airport_2_name || 'Airport')
              }
              if (data.station_lat && data.station_lng) {
                L.marker([data.station_lat, data.station_lng], { icon: transitIcon })
                  .addTo(map)
                  .bindPopup(data.station_name || 'Station')
              }
            } catch { /* ignore */ }
          }
        }
      }

      // ルート線（polyline）
      for (const ar of accessRoutes) {
        if (!ar.route_polyline) continue
        // 日本語ページは tokyo ルート、英語ページは venue_access ルート
        if (isEn && ar.origin_type !== 'venue_access') continue
        if (!isEn && ar.origin_type !== 'tokyo') continue

        try {
          const polylines = JSON.parse(ar.route_polyline)
          const polys = Array.isArray(polylines) ? polylines : [polylines]
          for (const encoded of polys) {
            if (typeof encoded !== 'string') continue
            const decoded = decodePolyline(encoded)
            if (decoded.length > 0) {
              L.polyline(decoded, { color: '#6366f1', weight: 3, opacity: 0.7 }).addTo(map)
            }
          }
        } catch { /* ignore */ }
      }

      // 全マーカーが見えるようにズーム調整
      const bounds = L.latLngBounds([[latitude, longitude]])
      for (const a of accommodations) {
        if (a.latitude && a.longitude) bounds.extend([a.latitude, a.longitude])
      }
      if (isEn) {
        for (const ar of accessRoutes) {
          if (ar.latitude && ar.longitude) bounds.extend([ar.latitude, ar.longitude])
        }
      }
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 })
      }
    })

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [latitude, longitude, accommodations, accessRoutes, isEn])

  if (!latitude || !longitude) return null

  return (
    <div ref={mapRef} className="h-[300px] w-full rounded-lg border" />
  )
}

/** Decode Google encoded polyline */
function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = []
  let index = 0, lat = 0, lng = 0
  while (index < encoded.length) {
    let b, shift = 0, result = 0
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    lat += (result & 1) ? ~(result >> 1) : (result >> 1)

    shift = 0
    result = 0
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    lng += (result & 1) ? ~(result >> 1) : (result >> 1)

    points.push([lat / 1e5, lng / 1e5])
  }
  return points
}

export default EventMap
