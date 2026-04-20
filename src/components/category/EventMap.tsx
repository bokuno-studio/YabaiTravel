import { useCallback, useMemo, useEffect, useRef } from 'react'
import { APIProvider, Map, Marker, useMap } from '@vis.gl/react-google-maps'
import type { AccessRoute, Accommodation } from '@/types/event'

interface EventMapProps {
  latitude: number | null
  longitude: number | null
  accommodations: Accommodation[]
  accessRoutes: AccessRoute[]
  isEn: boolean
}

interface PolylineObject {
  setMap: (map: unknown) => void
}

const ROUTE_COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6']

// Inner component that uses the map context
function EventMapContent({ latitude, longitude, accommodations, accessRoutes, isEn }: EventMapProps) {
  const map = useMap()
  const polylinesRef = useRef<PolylineObject[]>([])

  const center = useMemo(() => {
    if (!latitude || !longitude) return { lat: 35.68, lng: 139.76 }
    return { lat: latitude, lng: longitude }
  }, [latitude, longitude])

  // ルート線のデコード（英語版はルートごとに色分け）
  const polylineGroups = useMemo(() => {
    const groups: { paths: { lat: number; lng: number }[][]; color: string }[] = []
    for (const ar of accessRoutes) {
      if (!ar.route_polyline) continue
      if (isEn && ar.origin_type !== 'venue_access') continue
      if (!isEn && ar.origin_type !== 'tokyo') continue
      try {
        const polylines = JSON.parse(ar.route_polyline)
        const polys = Array.isArray(polylines) ? polylines : [polylines]
        if (isEn) {
          for (let i = 0; i < polys.length; i++) {
            if (typeof polys[i] !== 'string') continue
            groups.push({ paths: [decodePolyline(polys[i])], color: ROUTE_COLORS[i % ROUTE_COLORS.length] })
          }
        } else {
          const paths: { lat: number; lng: number }[][] = []
          for (const encoded of polys) {
            if (typeof encoded !== 'string') continue
            paths.push(decodePolyline(encoded))
          }
          if (paths.length > 0) groups.push({ paths, color: ROUTE_COLORS[0] })
        }
      } catch { /* ignore */ }
    }
    return groups
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

  // Render native Polylines when map is ready
  useEffect(() => {
    if (!map) return
    const gWindow = window as { google?: { maps?: { Polyline?: unknown } } }
    const g = gWindow.google
    if (!g?.maps?.Polyline) return

    // Clear previous polylines
    polylinesRef.current.forEach(polyline => polyline.setMap(null))
    polylinesRef.current = []

    // Create new polylines
    for (const group of polylineGroups) {
      for (const path of group.paths) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const polyline = new (g.maps as any).Polyline({
          path,
          strokeColor: group.color,
          strokeWeight: 5,
          strokeOpacity: 0.8,
          map,
        })
        polylinesRef.current.push(polyline)
      }
    }

    return () => {
      // Cleanup on unmount
      polylinesRef.current.forEach(polyline => polyline.setMap(null))
    }
  }, [map, polylineGroups])

  const onLoad = useCallback((mapInstance: unknown) => {
    const gWindow = window as { google?: { maps?: unknown } }
    const g = gWindow.google
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(g as any)?.maps?.LatLngBounds) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bounds = new (g as any).maps.LatLngBounds()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = mapInstance as any
    if (latitude && longitude) bounds.extend({ lat: latitude, lng: longitude })
    for (const a of accommodations) {
      if (a.latitude && a.longitude) bounds.extend({ lat: a.latitude, lng: a.longitude })
    }
    for (const t of transitMarkers) {
      bounds.extend({ lat: t.lat, lng: t.lng })
    }
    if (!bounds.isEmpty() && m.fitBounds) {
      m.fitBounds(bounds, 40)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const listener = (g as any).maps.event.addListener(m, 'idle', () => {
        if ((m.getZoom?.() ?? 0) > 13) {
          m.setZoom?.(13)
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (g as any).maps.event.removeListener(listener)
      })
    }
  }, [latitude, longitude, accommodations, transitMarkers])

  if (!latitude || !longitude) return null

  return (
    <Map
      style={{ width: '100%', height: '300px' }}
      defaultCenter={center}
      defaultZoom={10}
      onLoad={onLoad}
    >
      {/* 会場マーカー 📍 */}
      <Marker
        position={center}
        title={isEn ? 'Venue' : '会場'}
      >
        <div style={{ fontSize: '24px' }}>📍</div>
      </Marker>

      {/* 宿泊マーカー 🏨 */}
      {accommodations.filter(a => a.latitude && a.longitude).map((a, i) => (
        <Marker
          key={`hotel-${i}`}
          position={{ lat: a.latitude!, lng: a.longitude! }}
          title={isEn ? (a.recommended_area_en ?? a.recommended_area ?? 'Hotel') : (a.recommended_area ?? 'ホテル')}
        >
          <div style={{ fontSize: '20px' }}>🏨</div>
        </Marker>
      ))}

      {/* 空港・駅マーカー（英語版） ✈️ 🚉 */}
      {transitMarkers.map((m, i) => (
        <Marker
          key={`transit-${i}`}
          position={{ lat: m.lat, lng: m.lng }}
          title={m.label}
        >
          <div style={{ fontSize: '20px' }}>
            {m.label.toLowerCase().includes('airport') ? '✈️' : '🚉'}
          </div>
        </Marker>
      ))}
    </Map>
  )
}

// Outer component that provides API context
function EventMap(props: EventMapProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''

  if (!apiKey) {
    return <p className="text-sm text-muted-foreground">Map unavailable (API key not set)</p>
  }

  return (
    <APIProvider apiKey={apiKey}>
      <EventMapContent {...props} />
    </APIProvider>
  )
}

/** Decode Google encoded polyline */
function decodePolyline(encoded: string): { lat: number; lng: number }[] {
  const points: { lat: number; lng: number }[] = []
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
