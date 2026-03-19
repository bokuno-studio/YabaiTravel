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
    location_en: null,
    country: 'Japan',
    country_en: null,
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
    latitude: null,
    longitude: null,
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

  it('includes location as Place', () => {
    const result = eventToJsonLd(makeEvent(), [])
    expect(result.location).toEqual({
      '@type': 'Place',
      name: 'Tokyo',
      address: 'Tokyo',
    })
  })

  it('omits location when null', () => {
    const result = eventToJsonLd(makeEvent({ location: null }), [])
    expect(result.location).toBeUndefined()
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
})

describe('categoryToJsonLd', () => {
  it('returns JSON-LD with combined name', () => {
    const result = categoryToJsonLd(makeEvent(), makeCategory())
    expect(result.name).toBe('Test Race - 50km')
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

  it('includes offers', () => {
    const result = categoryToJsonLd(makeEvent(), makeCategory({ entry_fee: 20000, entry_fee_currency: null }))
    expect(result.offers.price).toBe(20000)
    expect(result.offers.priceCurrency).toBe('JPY')
  })

  it('omits offers when entry_fee is null', () => {
    const result = categoryToJsonLd(makeEvent(), makeCategory({ entry_fee: null }))
    expect(result.offers).toBeUndefined()
  })
})
