/**
 * Albatros Adventure Marathons — adventure marathon events
 */
export const SOURCE_NAME = 'albatros'
export const RACE_TYPE = 'marathon'

export function parse(html, url, cheerioLoad, ctx) {
  const $ = cheerioLoad(html)
  const races = []
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    const text = $(el).text().trim()
    if (!href || !text || text.includes('\u306e\u8a73\u7d30\u3092\u898b\u308b')) return
    if (text.length < 5 || text.length > 80) return
    if (!/marathon|ultra|trail/i.test(text)) return
    const officialUrl = href.startsWith('http') ? href : new URL(href, url).href
    if (/\/(german|french|spanish|italian)\b/i.test(officialUrl)) return
    races.push({ name: text, official_url: officialUrl, entry_url: officialUrl, race_type: RACE_TYPE, source: SOURCE_NAME })
  })
  return ctx.limitForEnv(races, 1)
}

export function matchesUrl(url) {
  return url.includes('albatros-adventure-marathons.com')
}
