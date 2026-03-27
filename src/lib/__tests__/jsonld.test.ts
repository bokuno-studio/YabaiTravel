import { describe, it, expect } from 'vitest'
import { eventToJsonLd, categoryToJsonLd } from '../jsonld'
import type { Event, Category } from '@/types/event'

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'ev-1',
    name: 'Test Race',
    event_date: '2025-06-15',
    event_date_end: '2025-06-16',
    location: 'Tokyo',
    location_en: 'Tokyo, Japan',
    country: '日本',
    country_en: 'Japan',
    official_url: 'https://example.com',
    entry_url: null,
    race_type: 'trail',
    participant_count: null,
    stay_status: null,
    weather_history: null,
    weather_forecast: null,
    entry_start: null,
    entry_end: null,
    entry_start_typical: null,
    entry_end_typical: null,
    reception_place: null,
    start_place: null,
    prohibited_items: null,
    course_map_url: null,
    furusato_nozei_url: null,
    event_series_id: null,
    total_cost_estimate: null,
    entry_type: null,
    required_qualification: null,
    previous_edition_url: null,
    visa_info: null,
    recovery_facilities: null,
    photo_spots: null,
    description: 'A great race',
    description_en: 'A great race in English',
    name_en: 'Test Race EN',
    latitude: 35.6762,
    longitude: 139.6503,
    collected_at: null,
    updated_at: null,
    ...overrides,
  }
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-1',
    event_id: 'ev-1',
    name: '50km',
    name_en: '50km EN',
    stay_status: null,
    distance_km: 50,
    elevation_gain: 3000,
    start_time: null,
    reception_end: null,
    reception_place: null,
    start_place: null,
    finish_rate: null,
    time_limit: null,
    cutoff_times: null,
    required_pace: null,
    required_climb_pace: null,
    mandatory_gear: null,
    recommended_gear: null,
    prohibited_items: null,
    poles_allowed: null,
    entry_fee: 15000,
    entry_fee_currency: '円',
    itra_points: null,
    collected_at: null,
    updated_at: null,
    ...overrides,
  }
}

describe('eventToJsonLd', () => {
  it('returns valid SportsEvent JSON-LD', () => {
    const result = eventToJsonLd(makeEvent(), [])
    expect(result['@context']).toBe('https://schema.org')
    expect(result['@type']).toBe('SportsEvent')
    expect(result.name).toBe('Test Race')
    expect(result.startDate).toBe('2025-06-15')
    expect(result.endDate).toBe('2025-06-16')
    expect(result.url).toBe('https://example.com')
    expect(result.description).toBe('A great race')
  })

  it('includes eventAttendanceMode and eventStatus', () => {
    const result = eventToJsonLd(makeEvent(), [])
    expect(result.eventAttendanceMode).toBe('https://schema.org/OfflineEventAttendanceMode')
    expect(result.eventStatus).toBe('https://schema.org/EventScheduled')
  })

  it('includes location as Place with PostalAddress', () => {
    const result = eventToJsonLd(makeEvent(), [])
    expect(result.location).toEqual({
      '@type': 'Place',
      name: 'Tokyo',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Tokyo',
        addressCountry: '日本',
      },
      geo: {
        '@type': 'GeoCoordinates',
        latitude: 35.6762,
        longitude: 139.6503,
      },
    })
  })

  it('omits geo when lat/lng are null', () => {
    const result = eventToJsonLd(makeEvent({ latitude: null, longitude: null }), [])
    expect(result.location.geo).toBeUndefined()
  })

  it('omits location when null', () => {
    const result = eventToJsonLd(makeEvent({ location: null }), [])
    expect(result.location).toBeUndefined()
  })

  it('includes top-level offers from first category', () => {
    const cats = [makeCategory()]
    const result = eventToJsonLd(makeEvent(), cats)
    expect(result.offers).toEqual({
      '@type': 'Offer',
      price: 15000,
      priceCurrency: 'JPY',
      availability: 'https://schema.org/InStock',
    })
  })

  it('includes entry_url in top-level offers when available', () => {
    const cats = [makeCategory()]
    const result = eventToJsonLd(makeEvent({ entry_url: 'https://entry.example.com' }), cats)
    expect(result.offers.url).toBe('https://entry.example.com')
  })

  it('includes subEvents from categories', () => {
    const cats = [makeCategory()]
    const result = eventToJsonLd(makeEvent(), cats)
    expect(result.subEvent).toHaveLength(1)
    expect(result.subEvent[0]['@type']).toBe('SportsEvent')
    expect(result.subEvent[0].name).toBe('50km')
  })

  it('includes distance in subEvent', () => {
    const cats = [makeCategory({ distance_km: 50 })]
    const result = eventToJsonLd(makeEvent(), cats)
    expect(result.subEvent[0].distance).toEqual({
      '@type': 'QuantitativeValue',
      value: 50,
      unitCode: 'KMT',
    })
  })

  it('includes offer with JPY currency for 円', () => {
    const cats = [makeCategory({ entry_fee: 15000, entry_fee_currency: '円' })]
    const result = eventToJsonLd(makeEvent(), cats)
    expect(result.subEvent[0].offers).toEqual({
      '@type': 'Offer',
      price: 15000,
      priceCurrency: 'JPY',
      availability: 'https://schema.org/InStock',
    })
  })

  it('uses entry_fee_currency as-is when not 円', () => {
    const cats = [makeCategory({ entry_fee: 100, entry_fee_currency: 'USD' })]
    const result = eventToJsonLd(makeEvent(), cats)
    expect(result.subEvent[0].offers.priceCurrency).toBe('USD')
  })

  it('removes undefined values', () => {
    const result = eventToJsonLd(makeEvent({ event_date: null, description: null }), [])
    expect(result).not.toHaveProperty('startDate')
    expect(result).not.toHaveProperty('description')
  })

  it('uses English names when isEn=true', () => {
    const cats = [makeCategory()]
    const result = eventToJsonLd(makeEvent(), cats, true)
    expect(result.name).toBe('Test Race EN')
    expect(result.description).toBe('A great race in English')
    expect(result.location.name).toBe('Tokyo, Japan')
    expect(result.location.address.addressCountry).toBe('Japan')
    expect(result.subEvent[0].name).toBe('50km EN')
  })

  it('falls back to Japanese when English fields are null', () => {
    const result = eventToJsonLd(makeEvent({ name_en: null, description_en: null, location_en: null }), [], true)
    expect(result.name).toBe('Test Race')
    expect(result.description).toBe('A great race')
    expect(result.location.name).toBe('Tokyo')
  })
})

describe('categoryToJsonLd', () => {
  it('returns JSON-LD with combined name', () => {
    const result = categoryToJsonLd(makeEvent(), makeCategory())
    expect(result.name).toBe('Test Race - 50km')
  })

  it('uses English names when isEn=true', () => {
    const result = categoryToJsonLd(makeEvent(), makeCategory(), true)
    expect(result.name).toBe('Test Race EN - 50km EN')
    expect(result.description).toBe('A great race in English')
  })

  it('includes eventAttendanceMode and eventStatus', () => {
    const result = categoryToJsonLd(makeEvent(), makeCategory())
    expect(result.eventAttendanceMode).toBe('https://schema.org/OfflineEventAttendanceMode')
    expect(result.eventStatus).toBe('https://schema.org/EventScheduled')
  })

  it('includes location with geo', () => {
    const result = categoryToJsonLd(makeEvent(), makeCategory())
    expect(result.location.geo).toEqual({
      '@type': 'GeoCoordinates',
      latitude: 35.6762,
      longitude: 139.6503,
    })
  })

  it('includes distance', () => {
    const result = categoryToJsonLd(makeEvent(), makeCategory({ distance_km: 100 }))
    expect(result.distance).toEqual({
      '@type': 'QuantitativeValue',
      value: 100,
      unitCode: 'KMT',
    })
  })

  it('omits distance when null', () => {
    const result = categoryToJsonLd(makeEvent(), makeCategory({ distance_km: null }))
    expect(result.distance).toBeUndefined()
  })

  it('includes offers with availability', () => {
    const result = categoryToJsonLd(makeEvent(), makeCategory({ entry_fee: 20000, entry_fee_currency: null }))
    expect(result.offers.price).toBe(20000)
    expect(result.offers.priceCurrency).toBe('JPY')
    expect(result.offers.availability).toBe('https://schema.org/InStock')
  })

  it('includes entry_url in offers when available', () => {
    const result = categoryToJsonLd(makeEvent({ entry_url: 'https://entry.example.com' }), makeCategory())
    expect(result.offers.url).toBe('https://entry.example.com')
  })

  it('omits offers when entry_fee is null', () => {
    const result = categoryToJsonLd(makeEvent(), makeCategory({ entry_fee: null }))
    expect(result.offers).toBeUndefined()
  })
})
