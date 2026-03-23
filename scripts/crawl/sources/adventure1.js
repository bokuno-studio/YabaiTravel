/**
 * Adventure1 Series — adventure racing events
 */
import { extract as extractAdventure1 } from '../../crawl-extract/extract-adventure1.js'

export const SOURCE_NAME = 'adventure1'
export const RACE_TYPE = 'adventure'

export function parse(html, url, _cheerioLoad, ctx) {
  const { races } = extractAdventure1(html)
  return races.map((r) => ({ ...r, source: SOURCE_NAME }))
}

export function matchesUrl(url) {
  return url.includes('adventure1series.com')
}
