/**
 * Tough Mudder — obstacle course events
 */
export const SOURCE_NAME = 'tough-mudder'
export const RACE_TYPE = 'tough_mudder'

export function parse(html, url, cheerioLoad, ctx) {
  const $ = cheerioLoad(html)
  const races = []
  $('a[href*="/events/"]').each((_, el) => {
    const href = $(el).attr('href')
    const text = $(el).text().trim()
    if (!href || !text || href.includes('season-pass') || text.includes('SEASON') || text.length < 3) return
    const officialUrl = href.startsWith('http') ? href : new URL(href, 'https://toughmudder.com/').href
    if (races.find((r) => r.official_url === officialUrl)) return
    races.push({ name: `Tough Mudder ${text}`, official_url: officialUrl, entry_url: officialUrl, race_type: RACE_TYPE, source: SOURCE_NAME })
  })
  return ctx.limitForEnv(races, 3)
}

export function matchesUrl(url) {
  return url.includes('toughmudder.com')
}
