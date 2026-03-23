/**
 * LAWSON DO! SPORTS — Japanese race entry platform
 */
export const SOURCE_NAME = 'lawson-do'
export const SOURCE_URLS = ['https://do.l-tike.com/']
export const RACE_TYPE = 'other'

/** Remove leading date patterns from event names */
function cleanEventName(name) {
  return (name || '')
    .replace(/^\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}[\(（][月火水木金土日][\)）]?\s*/, '')
    .replace(/^\d{4}年\d{1,2}月\d{1,2}日[\(（][月火水木金土日][\)）]?\s*/, '')
    .trim()
}

/**
 * @param {string} html
 * @param {string} url
 * @param {Function} cheerioLoad
 * @param {{ limitForEnv: Function }} ctx
 */
export function parse(html, url, cheerioLoad, ctx) {
  const $ = cheerioLoad(html)
  const races = []
  $('a[href*="race/detail"]').each((_, el) => {
    const href = $(el).attr('href')
    const name = cleanEventName($(el).text().trim())
    if (!href || !name || name.length < 5 || name.length > 100) return
    const entryUrl = href.startsWith('http') ? href : new URL(href, 'https://do.l-tike.com/').href
    races.push({ name, official_url: null, entry_url: entryUrl, race_type: RACE_TYPE, source: SOURCE_NAME })
  })
  return ctx.limitForEnv(races, 3)
}
