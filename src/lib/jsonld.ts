import type { Event, Category } from '../types/event'

/** Resolve currency code from entry_fee_currency field */
function resolveCurrency(raw: string | null | undefined): string {
  return raw === '円' || !raw ? 'JPY' : raw
}

/** Build a Place object with optional PostalAddress and geo */
function buildPlace(event: Event, isEn: boolean) {
  const name = isEn ? (event.location_en ?? event.location) : event.location
  if (!name) return undefined

  const place: Record<string, unknown> = {
    '@type': 'Place',
    name,
    address: {
      '@type': 'PostalAddress',
      addressLocality: name,
      addressCountry: isEn ? (event.country_en ?? event.country) : event.country,
    },
  }

  if (event.latitude != null && event.longitude != null) {
    place.geo = {
      '@type': 'GeoCoordinates',
      latitude: event.latitude,
      longitude: event.longitude,
    }
  }

  return place
}

/** Build an Offer from a category's entry fee */
function buildOffer(cat: Category) {
  if (cat.entry_fee == null) return undefined
  return {
    '@type': 'Offer',
    price: cat.entry_fee,
    priceCurrency: resolveCurrency(cat.entry_fee_currency),
    availability: 'https://schema.org/InStock',
    url: undefined as string | undefined,
  }
}

export function eventToJsonLd(event: Event, categories: Category[], isEn = false) {
  const name = isEn ? (event.name_en ?? event.name) : event.name
  const description = isEn ? (event.description_en ?? event.description) : event.description

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name,
    startDate: event.event_date ?? undefined,
    endDate: event.event_date_end ?? undefined,
    url: event.official_url ?? undefined,
    description: description ?? undefined,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
  }

  const place = buildPlace(event, isEn)
  if (place) {
    jsonLd.location = place
  }

  // Top-level offers from first category entry fee
  if (categories.length > 0) {
    const firstOffer = buildOffer(categories[0])
    if (firstOffer) {
      if (event.entry_url) firstOffer.url = event.entry_url
      jsonLd.offers = firstOffer
    }
  }

  if (categories.length > 0) {
    jsonLd.subEvent = categories.map((cat) => {
      const catName = isEn ? (cat.name_en ?? cat.name) : cat.name
      const sub: Record<string, unknown> = {
        '@type': 'SportsEvent',
        name: catName,
      }
      if (cat.distance_km != null) {
        sub.distance = {
          '@type': 'QuantitativeValue',
          value: cat.distance_km,
          unitCode: 'KMT',
        }
      }
      const offer = buildOffer(cat)
      if (offer) {
        sub.offers = offer
      }
      return sub
    })
  }

  // Remove undefined values
  return JSON.parse(JSON.stringify(jsonLd))
}

export function categoryToJsonLd(event: Event, category: Category, isEn = false) {
  const eventName = isEn ? (event.name_en ?? event.name) : event.name
  const catName = isEn ? (category.name_en ?? category.name) : category.name
  const description = isEn ? (event.description_en ?? event.description) : event.description

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: `${eventName} - ${catName}`,
    startDate: event.event_date ?? undefined,
    endDate: event.event_date_end ?? undefined,
    url: event.official_url ?? undefined,
    description: description ?? undefined,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
  }

  const place = buildPlace(event, isEn)
  if (place) {
    jsonLd.location = place
  }

  if (category.distance_km != null) {
    jsonLd.distance = {
      '@type': 'QuantitativeValue',
      value: category.distance_km,
      unitCode: 'KMT',
    }
  }

  const offer = buildOffer(category)
  if (offer) {
    if (event.entry_url) offer.url = event.entry_url
    jsonLd.offers = offer
  }

  // Remove undefined values
  return JSON.parse(JSON.stringify(jsonLd))
}
