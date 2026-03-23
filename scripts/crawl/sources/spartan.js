/**
 * Spartan Race — find-race pages from multiple country domains
 */
import { extract as extractSpartan } from '../../crawl-extract/extract-spartan.js'

export const SOURCE_NAME = 'spartan'
export const RACE_TYPE = 'spartan'

/**
 * @param {string} html
 * @param {string} url
 * @param {Function} _cheerioLoad - unused (extract handles internally)
 * @param {{ limitForEnv: Function }} ctx
 */
export function parse(html, url, _cheerioLoad, ctx) {
  const base = url.replace(/\/$/, '')
  const { races } = extractSpartan(html, base)
  return ctx.limitForEnv(races.map((r) => ({ ...r, source: SOURCE_NAME })), 1)
}

/** Override default fetch URL: append /race/find-race */
export function getFetchUrl(url) {
  const base = url.replace(/\/$/, '')
  return base + (base.endsWith('/en') ? '/race/find-race' : '/en/race/find-race')
}

export function matchesUrl(url) {
  return url.includes('spartan.com')
}
