import type { Event, Category } from '../types/event'

export function eventToJsonLd(event: Event, categories: Category[]) {
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: event.name,
    startDate: event.event_date ?? undefined,
    endDate: event.event_date_end ?? undefined,
    url: event.official_url ?? undefined,
    description: event.description ?? undefined,
  }

  if (event.location) {
    jsonLd.location = {
      '@type': 'Place',
      name: event.location,
      address: event.location,
    }
  }

  if (categories.length > 0) {
    jsonLd.subEvent = categories.map((cat) => {
      const sub: Record<string, unknown> = {
        '@type': 'SportsEvent',
        name: cat.name,
      }
      if (cat.distance_km != null) {
        sub.distance = {
          '@type': 'QuantitativeValue',
          value: cat.distance_km,
          unitCode: 'KMT',
        }
      }
      if (cat.entry_fee != null) {
        sub.offers = {
          '@type': 'Offer',
          price: cat.entry_fee,
          priceCurrency: cat.entry_fee_currency === '円' || !cat.entry_fee_currency ? 'JPY' : cat.entry_fee_currency,
        }
      }
      return sub
    })
  }

  // Remove undefined values
  return JSON.parse(JSON.stringify(jsonLd))
}

export function categoryToJsonLd(event: Event, category: Category) {
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: `${event.name} - ${category.name}`,
    startDate: event.event_date ?? undefined,
    endDate: event.event_date_end ?? undefined,
    url: event.official_url ?? undefined,
    description: event.description ?? undefined,
  }

  if (event.location) {
    jsonLd.location = {
      '@type': 'Place',
      name: event.location,
      address: event.location,
    }
  }

  if (category.distance_km != null) {
    jsonLd.distance = {
      '@type': 'QuantitativeValue',
      value: category.distance_km,
      unitCode: 'KMT',
    }
  }

  if (category.entry_fee != null) {
    jsonLd.offers = {
      '@type': 'Offer',
      price: category.entry_fee,
      priceCurrency: category.entry_fee_currency === '円' || !category.entry_fee_currency ? 'JPY' : category.entry_fee_currency,
    }
  }

  // Remove undefined values
  return JSON.parse(JSON.stringify(jsonLd))
}
