/**
 * AR World Series — adventure racing world series
 */
import { extract as extractARWorldSeries } from '../../crawl-extract/extract-ar-world-series.js'

export const SOURCE_NAME = 'ar-world-series'
export const RACE_TYPE = 'adventure'

export function parse(html, url, _cheerioLoad, ctx) {
  const { races } = extractARWorldSeries(html)
  return races.map((r) => ({ ...r, source: SOURCE_NAME }))
}

export function matchesUrl(url) {
  return url.includes('arworldseries.com')
}
