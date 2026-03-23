/**
 * A-Extremo — adventure race events
 */
import { extract as extractAExtremo } from '../../crawl-extract/extract-a-extremo.js'

export const SOURCE_NAME = 'a-extremo'
export const RACE_TYPE = 'adventure'

export function parse(html, url, _cheerioLoad, ctx) {
  const { races } = extractAExtremo(html)
  return races.map((r) => ({ ...r, source: SOURCE_NAME }))
}

export function matchesUrl(url) {
  return url.includes('a-extremo.com')
}
