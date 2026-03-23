/**
 * Running in the USA — US marathon directory
 */
export const SOURCE_NAME = 'running-usa'
export const SOURCE_URLS = ['https://www.runningintheusa.com/']
export const RACE_TYPE = 'marathon'

export function parse(html, url, cheerioLoad, ctx) {
  const $ = cheerioLoad(html)
  const races = []
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    const text = $(el).text().trim()
    if (!href || !text || text.length < 5 || text.length > 120) return
    if (!/race|event|marathon|run|ultra/i.test(href + ' ' + text)) return
    const fullUrl = href.startsWith('http') ? href : new URL(href, url).href
    if (races.find((r) => r.official_url === fullUrl)) return
    races.push({ name: text, official_url: fullUrl, entry_url: fullUrl, race_type: RACE_TYPE, country: 'US', source: SOURCE_NAME })
  })
  return ctx.limitForEnv(races, 5)
}
