/**
 * SportsEntry — Japanese race entry platform
 */
export const SOURCE_NAME = 'sports-entry'
export const SOURCE_URLS = ['https://www.sportsentry.ne.jp/']
export const RACE_TYPE = 'other'

/**
 * @param {string} html
 * @param {string} url
 * @param {Function} cheerioLoad
 * @param {{ limitForEnv: Function }} ctx
 */
export function parse(html, url, cheerioLoad, ctx) {
  const $ = cheerioLoad(html)
  const races = []
  $('a[href*="/event/"]').each((_, el) => {
    const href = $(el).attr('href')
    const name = $(el).text().trim()
    if (!href || !name || name.length < 5 || name.length > 100) return
    const entryUrl = href.startsWith('http') ? href : new URL(href, 'https://www.sportsentry.ne.jp/').href
    races.push({ name, official_url: null, entry_url: entryUrl, race_type: RACE_TYPE, source: SOURCE_NAME })
  })
  return ctx.limitForEnv(races, 3)
}
