/**
 * Vietnam Trail Series — Vietnamese trail events
 */
export const SOURCE_NAME = 'vietnam-trail'
export const SOURCE_URLS = ['https://vietnamtrailseries.com/']
export const RACE_TYPE = 'trail'

const RACE_URLS = [
  'https://vietnamtrailseries.com/trail-marathon/',
  'https://vietnamtrailseries.com/mountain-marathon/',
  'https://vietnamtrailseries.com/jungle-marathon/'
]

export function parse(html, url, cheerioLoad, ctx) {
  return RACE_URLS.map(raceUrl => ({
    name: raceUrl.match(/\/([^\/]+)\/$/)[1].replace(/-/g, ' ').toUpperCase(),
    official_url: raceUrl,
    entry_url: raceUrl,
    race_type: RACE_TYPE,
    country: 'Vietnam',
    source: SOURCE_NAME
  }))
}
