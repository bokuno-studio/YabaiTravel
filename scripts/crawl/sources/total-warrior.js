/**
 * Total Warrior — obstacle events in the UK
 */
export const SOURCE_NAME = 'total-warrior'
export const RACE_TYPE = 'total_warrior'

export function parse(html, url, cheerioLoad, ctx) {
  const $ = cheerioLoad(html)
  const races = []
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    const text = $(el).text().trim()
    if (!href || !text || text.length < 5 || text.length > 100) return
    if (!/event|race|location|venue/i.test(href) && !/warrior/i.test(text)) return
    const officialUrl = href.startsWith('http') ? href : new URL(href, 'https://www.totalwarrior.co.uk/').href
    if (races.find((r) => r.official_url === officialUrl)) return
    races.push({ name: text, official_url: officialUrl, entry_url: officialUrl, race_type: RACE_TYPE, country: 'UK', source: SOURCE_NAME })
  })
  return ctx.limitForEnv(races, 2)
}

export function matchesUrl(url) {
  return url.includes('totalwarrior.co.uk')
}
