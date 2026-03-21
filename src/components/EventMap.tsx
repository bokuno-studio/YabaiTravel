import { APIProvider, Map, Marker, InfoWindow } from '@vis.gl/react-google-maps'
import { useState, useCallback } from 'react'
import type { EventWithCategories } from '../types/event'

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || ''

interface EventMapProps {
  events: EventWithCategories[]
  langPrefix: string
  raceTypeLabel: (t: string | null) => string
  lang?: string
}

function EventMap({ events, langPrefix, raceTypeLabel, lang: langProp }: EventMapProps) {
  const isEn = langProp === 'en'
  const [selectedEvent, setSelectedEvent] = useState<EventWithCategories | null>(null)

  const mappable = events.filter((e) => e.latitude != null && e.longitude != null)

  const handleMarkerClick = useCallback((event: EventWithCategories) => {
    setSelectedEvent(event)
  }, [])

  if (!API_KEY || mappable.length === 0) return null

  // #7: Set map language based on route lang
  const mapLanguage = isEn ? 'en' : 'ja'

  return (
    <APIProvider apiKey={API_KEY} language={mapLanguage}>
      <div style={{ width: '100%', height: '400px', borderRadius: '0.75rem', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <Map
          defaultCenter={{ lat: 36.0, lng: 139.6 }}
          defaultZoom={3}
          gestureHandling="greedy"
          disableDefaultUI={false}
        >
          {mappable.map((event) => (
            <Marker
              key={event.id}
              position={{ lat: event.latitude!, lng: event.longitude! }}
              onClick={() => handleMarkerClick(event)}
            />
          ))}

          {selectedEvent && (
            <InfoWindow
              position={{ lat: selectedEvent.latitude!, lng: selectedEvent.longitude! }}
              onCloseClick={() => setSelectedEvent(null)}
            >
              <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '250px' }}>
                <strong style={{ fontSize: '0.9rem' }}>
                  <a href={`${langPrefix}/events/${selectedEvent.id}`} style={{ color: '#0f172a', textDecoration: 'none' }}>
                    {isEn ? (selectedEvent.name_en ?? selectedEvent.name) : selectedEvent.name}
                  </a>
                </strong>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#475569' }}>
                  {selectedEvent.event_date || ''} / {isEn ? (selectedEvent.location_en ?? selectedEvent.location ?? '') : (selectedEvent.location || '')}
                </p>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
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
