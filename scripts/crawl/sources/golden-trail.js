/**
 * Golden Trail Series — trail running events
 */
import { extract as extractGoldenTrail } from '../../crawl-extract/extract-golden-trail.js'

export const SOURCE_NAME = 'golden-trail'
export const RACE_TYPE = 'trail'

export function parse(html, url, _cheerioLoad, ctx) {
  const { races } = extractGoldenTrail(html)
  return races.map((r) => ({ ...r, source: SOURCE_NAME }))
}

export function matchesUrl(url) {
  return url.includes('goldentrailseries.com')
}
