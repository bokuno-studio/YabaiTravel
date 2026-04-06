/**
 * JustRunLah! — Southeast Asian marathon events
 */
export const SOURCE_NAME = 'justrunlah'
export const SOURCE_URLS = ['https://www.justrunlah.com/']
export const RACE_TYPE = 'marathon'

export function parse(html, url, cheerioLoad, ctx) {
  const $ = cheerioLoad(html)
  const races = []

  // Exclude tool/article pages by URL pattern
  const excludedUrlPatterns = [/\/tools\//i, /\/articles\//i]

  // Exclude tool/article/person pages by title pattern
  const excludedTitlePatterns = [
    /calculator/i,  // BMI Calculator, Pace Calculator, etc.
    /^Rebekah Ong/i,  // Writer personal page
    /small habits/i,  // Blog article
    /david beckham/i  // News article
  ]

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    const text = $(el).text().trim()
    if (!href || !text || text.length < 5 || text.length > 120) return
    if (!/race|event|marathon|run|ultra/i.test(href + ' ' + text)) return
    const fullUrl = href.startsWith('http') ? href : new URL(href, url).href

    // Filter by URL pattern
    if (excludedUrlPatterns.some(pattern => pattern.test(fullUrl))) return

    // Filter by title pattern
    if (excludedTitlePatterns.some(pattern => pattern.test(text))) return

    if (races.find((r) => r.official_url === fullUrl)) return
    races.push({ name: text, official_url: fullUrl, entry_url: fullUrl, race_type: RACE_TYPE, source: SOURCE_NAME })
  })
  return ctx.limitForEnv(races, 5)
}
