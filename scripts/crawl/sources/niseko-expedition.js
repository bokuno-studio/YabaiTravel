/**
 * Niseko Expedition — adventure race in Japan
 */
import { extract as extractNisekoExpedition } from '../../crawl-extract/extract-niseko-expedition.js'

export const SOURCE_NAME = 'niseko-expedition'
export const RACE_TYPE = 'adventure'

export function parse(html, url, _cheerioLoad, ctx) {
  const { races } = extractNisekoExpedition(html)
  return races.map((r) => ({ ...r, source: SOURCE_NAME }))
}

export function matchesUrl(url) {
  return url.includes('nisekoexpedition.jp')
}
