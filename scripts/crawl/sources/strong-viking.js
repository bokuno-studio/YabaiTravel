/**
 * Strong Viking — obstacle race events
 */
import { extract as extractStrongViking } from '../../crawl-extract/extract-strong-viking.js'

export const SOURCE_NAME = 'strong-viking'
export const RACE_TYPE = 'obstacle'

export function parse(html, url, _cheerioLoad, ctx) {
  const { races } = extractStrongViking(html)
  return races.map((r) => ({ ...r, source: SOURCE_NAME }))
}

export function matchesUrl(url) {
  return url.includes('strongviking.com')
}
