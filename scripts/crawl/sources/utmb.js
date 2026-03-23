/**
 * UTMB World Series — ultra trail events
 */
import { extract as extractUtmb } from '../../crawl-extract/extract-utmb.js'

export const SOURCE_NAME = 'utmb'
export const RACE_TYPE = 'trail'

export function parse(html, url, _cheerioLoad, ctx) {
  const { races } = extractUtmb(html)
  return races.map((r) => ({ ...r, source: SOURCE_NAME }))
}

export function matchesUrl(url) {
  return url.includes('utmb.world/utmb-world-series')
}
