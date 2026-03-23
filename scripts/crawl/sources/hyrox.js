/**
 * HYROX — fitness race events
 */
import { extract as extractHyrox } from '../../crawl-extract/extract-hyrox.js'

export const SOURCE_NAME = 'hyrox'
export const RACE_TYPE = 'hyrox'

export function parse(html, url, _cheerioLoad, ctx) {
  const { races } = extractHyrox(html)
  return races.map((r) => ({ ...r, source: SOURCE_NAME }))
}

export function matchesUrl(url) {
  return url.includes('hyrox.com')
}
