import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { EventWithCategories } from '../types/event'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || ''

interface EventMapProps {
  events: EventWithCategories[]
  langPrefix: string
  raceTypeLabel: (t: string | null) => string
}

const RACE_TYPE_COLORS: Record<string, string> = {
  marathon: '#ef4444',
  trail: '#22c55e',
  triathlon: '#3b82f6',
  cycling: '#f59e0b',
  spartan: '#8b5cf6',
  hyrox: '#ec4899',
  obstacle: '#f97316',
  rogaining: '#14b8a6',
  adventure: '#6366f1',
  duathlon: '#06b6d4',
  other: '#6b7280',
}

function EventMap({ events, langPrefix, raceTypeLabel }: EventMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)

  const mappable = events.filter((e) => e.latitude != null && e.longitude != null)

  useEffect(() => {
    if (!mapContainer.current || !mapboxgl.accessToken || mappable.length === 0) return
    if (map.current) return

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [139.6, 36.0],
      zoom: 3,
    })

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right')

    for (const event of mappable) {
      const color = RACE_TYPE_COLORS[event.race_type || 'other'] || '#6b7280'
      const popup = new mapboxgl.Popup({ offset: 25, maxWidth: '280px' }).setHTML(`
        <div style="font-family: system-ui, sans-serif;">
          <strong style="font-size: 0.9rem;"><a href="${langPrefix}/events/${event.id}" style="color: #0f172a; text-decoration: none;">${event.name}</a></strong>
          <p style="margin: 0.25rem 0 0; font-size: 0.8rem; color: #475569;">
            ${event.event_date || ''} / ${event.location || ''}
          </p>
          <span style="display: inline-block; margin-top: 0.25rem; padding: 0.1rem 0.4rem; border-radius: 999px; font-size: 0.7rem; background: ${color}20; color: ${color}; border: 1px solid ${color}40;">
            ${raceTypeLabel(event.race_type)}
          </span>
        </div>
      `)

      new mapboxgl.Marker({ color })
        .setLngLat([event.longitude!, event.latitude!])
        .setPopup(popup)
        .addTo(map.current!)
    }

    return () => {
      map.current?.remove()
      map.current = null
    }
  }, [mappable.length])

  if (!mapboxgl.accessToken) return null
  if (mappable.length === 0) return null

  return (
    <div
      ref={mapContainer}
      style={{ width: '100%', height: '400px', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}
    />
  )
}

export default EventMap
