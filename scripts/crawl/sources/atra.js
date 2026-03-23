/**
 * ATRA / Trail Runner Magazine — trail race calendar
 */
export const SOURCE_NAME = 'atra'
export const SOURCE_URLS = ['https://trailrunner.com/race-calendar/']
export const RACE_TYPE = 'trail'

export function parse(html, url, cheerioLoad, ctx) {
  const $ = cheerioLoad(html)
  const races = []
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    const text = $(el).text().trim()
    if (!href || !text || text.length < 5 || text.length > 120) return
    if (!/race|event|trail|ultra|run|calendar/i.test(href + ' ' + text)) return
    const fullUrl = href.startsWith('http') ? href : new URL(href, url).href
    if (races.find((r) => r.official_url === fullUrl)) return
    races.push({ name: text, official_url: fullUrl, entry_url: fullUrl, race_type: RACE_TYPE, country: 'US', source: SOURCE_NAME })
  })
  return ctx.limitForEnv(races, 5)
}
