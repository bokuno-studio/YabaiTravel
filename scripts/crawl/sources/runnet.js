/**
 * RUNNET — trail race search results
 */
export const SOURCE_NAME = 'runnet'
export const SOURCE_URLS = ['https://runnet.jp/entry/runtes/user/pc/RaceSearchZZSDetailAction.do?command=search&available=1&distanceClass=6']
export const RACE_TYPE = 'trail'

/**
 * @param {string} html
 * @param {string} url
 * @param {Function} cheerioLoad
 * @param {{ limitForEnv: Function }} ctx
 */
export function parse(html, url, cheerioLoad, ctx) {
  const $ = cheerioLoad(html)
  const races = []
  $('a[href*="competitionDetailAction"], a[href*="moshicomDetailAction"]').each((_, el) => {
    const href = $(el).attr('href')
    const name = $(el).text().trim()
    if (!href || !name || name.length < 3) return
    const entryUrl = href.startsWith('http') ? href : new URL(href, 'https://runnet.jp/').href
    races.push({ name, official_url: null, entry_url: entryUrl, race_type: RACE_TYPE, source: SOURCE_NAME })
  })
  return ctx.limitForEnv(races, 5)
}
