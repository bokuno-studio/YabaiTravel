import { useCallback, useMemo } from 'react'
import { GoogleMap, useJsApiLoader, Marker, Polyline } from '@react-google-maps/api'
import type { AccessRoute, Accommodation } from '@/types/event'

interface EventMapProps {
  latitude: number | null
  longitude: number | null
  accommodations: Accommodation[]
  accessRoutes: AccessRoute[]
  isEn: boolean
}

const containerStyle = { width: '100%', height: '300px' }

function EventMap({ latitude, longitude, accommodations, accessRoutes, isEn }: EventMapProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: apiKey,
  })

  const center = useMemo(() => {
    if (!latitude || !longitude) return { lat: 35.68, lng: 139.76 }
    return { lat: latitude, lng: longitude }
  }, [latitude, longitude])

  // ルート線のデコード
  const polylinePaths = useMemo(() => {
    const paths: google.maps.LatLngLiteral[][] = []
    for (const ar of accessRoutes) {
      if (!ar.route_polyline) continue
      if (isEn && ar.origin_type !== 'venue_access') continue
      if (!isEn && ar.origin_type !== 'tokyo') continue
      try {
        const polylines = JSON.parse(ar.route_polyline)
        const polys = Array.isArray(polylines) ? polylines : [polylines]
        for (const encoded of polys) {
          if (typeof encoded !== 'string') continue
          paths.push(decodePolyline(encoded))
        }
      } catch { /* ignore */ }
    }
    return paths
  }, [accessRoutes, isEn])

  // 空港・駅マーカー（英語版のみ、構造化JSONから）
  const transitMarkers = useMemo(() => {
    if (!isEn) return []
    const markers: { lat: number; lng: number; label: string }[] = []
    for (const ar of accessRoutes) {
      if (ar.origin_type !== 'venue_access' || !ar.route_detail_en) continue
      try {
        const data = JSON.parse(ar.route_detail_en)
        if (data.airport_1_lat && data.airport_1_lng) {
          markers.push({ lat: data.airport_1_lat, lng: data.airport_1_lng, label: data.airport_1_name || 'Airport' })
        }
        if (data.airport_2_lat && data.airport_2_lng) {
          markers.push({ lat: data.airport_2_lat, lng: data.airport_2_lng, label: data.airport_2_name || 'Airport' })
        }
        if (data.station_lat && data.station_lng) {
          markers.push({ lat: data.station_lat, lng: data.station_lng, label: data.station_name || 'Station' })
        }
      } catch { /* ignore */ }
    }
    return markers
  }, [accessRoutes, isEn])

  const onLoad = useCallback((map: google.maps.Map) => {
    const bounds = new google.maps.LatLngBounds()
    if (latitude && longitude) bounds.extend({ lat: latitude, lng: longitude })
    for (const a of accommodations) {
      if (a.latitude && a.longitude) bounds.extend({ lat: a.latitude, lng: a.longitude })
    }
    for (const m of transitMarkers) {
      bounds.extend({ lat: m.lat, lng: m.lng })
    }
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, 40)
      const listener = google.maps.event.addListener(map, 'idle', () => {
        if (map.getZoom()! > 13) map.setZoom(13)
        google.maps.event.removeListener(listener)
      })
    }
  }, [latitude, longitude, accommodations, transitMarkers])

  if (!latitude || !longitude) return null
  if (!apiKey) return <p className="text-sm text-muted-foreground">Map unavailable (API key not set)</p>
  if (!isLoaded) return <div className="h-[300px] w-full animate-pulse rounded-lg bg-muted" />

  return (
    <GoogleMap mapContainerStyle={containerStyle} center={center} zoom={10} onLoad={onLoad}>
      {/* 会場マーカー */}
      <Marker
        position={center}
        title={isEn ? 'Venue' : '会場'}
        icon={{
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: '#ef4444',
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 2,
        }}
      />

      {/* 宿泊マーカー */}
      {accommodations.filter(a => a.latitude && a.longitude).map((a, i) => (
        <Marker
          key={`hotel-${i}`}
          position={{ lat: a.latitude!, lng: a.longitude! }}
          title={isEn ? (a.recommended_area_en ?? a.recommended_area ?? 'Hotel') : (a.recommended_area ?? 'ホテル')}
          icon={{
            path: google.maps.SymbolPath.CIRCLE,
            scale: 6,
            fillColor: '#3b82f6',
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 2,
          }}
        />
      ))}

      {/* 空港・駅マーカー（英語版） */}
      {transitMarkers.map((m, i) => (
        <Marker
          key={`transit-${i}`}
          position={{ lat: m.lat, lng: m.lng }}
          title={m.label}
          icon={{
            path: google.maps.SymbolPath.CIRCLE,
            scale: 6,
            fillColor: '#22c55e',
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 2,
          }}
        />
      ))}

      {/* ルート線 */}
      {polylinePaths.map((path, i) => (
        <Polyline
          key={`route-${i}`}
          path={path}
          options={{ strokeColor: '#6366f1', strokeWeight: 3, strokeOpacity: 0.7 }}
        />
      ))}
    </GoogleMap>
  )
}

/** Decode Google encoded polyline */
function decodePolyline(encoded: string): google.maps.LatLngLiteral[] {
  const points: google.maps.LatLngLiteral[] = []
  let index = 0, lat = 0, lng = 0
  while (index < encoded.length) {
    let b, shift = 0, result = 0
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    lat += (result & 1) ? ~(result >> 1) : (result >> 1)
    shift = 0; result = 0
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    lng += (result & 1) ? ~(result >> 1) : (result >> 1)
    points.push({ lat: lat / 1e5, lng: lng / 1e5 })
  }
  return points
}

export default EventMap
