import { APIProvider, Map, AdvancedMarker, InfoWindow } from '@vis.gl/react-google-maps'
import { useState, useCallback } from 'react'
import type { EventWithCategories } from '../types/event'

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || ''

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
  const [selectedEvent, setSelectedEvent] = useState<EventWithCategories | null>(null)

  const mappable = events.filter((e) => e.latitude != null && e.longitude != null)

  const handleMarkerClick = useCallback((event: EventWithCategories) => {
    setSelectedEvent(event)
  }, [])

  if (!API_KEY || mappable.length === 0) return null

  return (
    <APIProvider apiKey={API_KEY}>
      <div style={{ width: '100%', height: '400px', borderRadius: '0.75rem', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <Map
          defaultCenter={{ lat: 36.0, lng: 139.6 }}
          defaultZoom={3}
          gestureHandling="greedy"
          disableDefaultUI={false}
          mapId="yabai-travel-map"
        >
          {mappable.map((event) => {
            const color = RACE_TYPE_COLORS[event.race_type || 'other'] || '#6b7280'
            return (
              <AdvancedMarker
                key={event.id}
                position={{ lat: event.latitude!, lng: event.longitude! }}
                onClick={() => handleMarkerClick(event)}
              >
                <div style={{
                  width: '12px', height: '12px', borderRadius: '50%',
                  background: color, border: '2px solid white',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)', cursor: 'pointer',
                }} />
              </AdvancedMarker>
            )
          })}

          {selectedEvent && (
            <InfoWindow
              position={{ lat: selectedEvent.latitude!, lng: selectedEvent.longitude! }}
              onCloseClick={() => setSelectedEvent(null)}
            >
              <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '250px' }}>
                <strong style={{ fontSize: '0.9rem' }}>
                  <a href={`${langPrefix}/events/${selectedEvent.id}`} style={{ color: '#0f172a', textDecoration: 'none' }}>
                    {selectedEvent.name}
                  </a>
                </strong>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#475569' }}>
                  {selectedEvent.event_date || ''} / {selectedEvent.location || ''}
                </p>
                <span style={{
                  display: 'inline-block', marginTop: '0.25rem', padding: '0.1rem 0.4rem',
                  borderRadius: '999px', fontSize: '0.7rem',
                  background: `${RACE_TYPE_COLORS[selectedEvent.race_type || 'other']}20`,
                  color: RACE_TYPE_COLORS[selectedEvent.race_type || 'other'],
                  border: `1px solid ${RACE_TYPE_COLORS[selectedEvent.race_type || 'other']}40`,
                }}>
                  {raceTypeLabel(selectedEvent.race_type)}
                </span>
              </div>
            </InfoWindow>
          )}
        </Map>
      </div>
    </APIProvider>
  )
}

export default EventMap
