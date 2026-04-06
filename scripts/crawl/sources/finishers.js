/**
 * Finishers — European trail and marathon events
 */
export const SOURCE_NAME = 'finishers'
export const SOURCE_URLS = ['https://www.finishers.com/']
export const RACE_TYPE = 'trail'

export function parse(html, url, cheerioLoad, ctx) {
  const $ = cheerioLoad(html)
  const races = []

  // Exclude category/filter pages by title pattern
  const excludedTitlePatterns = [
    /\d+\s+courses$/i,  // "[數字] courses" pattern (e.g., "juillet736 courses", "Trail4 267 courses")
    /^Toutes les courses$/i,  // "All races" menu
    /^Courses virtuelles$/i,  // Virtual races category
    // Race type categories (navigation pages, not actual races)
    /^Marche$/i,
    /^Marche Ultra$/i,
    /^Marche longue$/i,
    /^Marche découverte$/i,
    /^Trail$/i,
    /^Trail long$/i,
    /^Trail court$/i,
    /^Trail découverte$/i,
    /^Ultra Trail$/i,
    /^Ultra-Marathon$/i,
    /^Semi-Marathon$/i,
    /^10 km$/i,
    /^20 km$/i,
    /^100km$/i,
    /^Course en heure$/i,
    /^Gravel Ultra Distance$/i,
    /^Ultra Cyclisme$/i,
    // Navigation items
    /^Types de course$/i
  ]

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    const text = $(el).text().trim()
    if (!href || !text || text.length < 5 || text.length > 120) return
    if (!/race|event|marathon|trail|ultra|run|course/i.test(href + ' ' + text)) return
    const fullUrl = href.startsWith('http') ? href : new URL(href, url).href

    // Filter by URL pattern (list/filter pages)
    if (/\/(tag|tags|category|categories|results|calendar|month)/i.test(fullUrl)) return

    // Verify domain is finishers.com
    try {
      const urlObj = new URL(fullUrl)
      if (!urlObj.hostname.includes('finishers.com')) return
    } catch {
      return
    }

    // Filter by title pattern
    if (excludedTitlePatterns.some(pattern => pattern.test(text))) return

    if (races.find((r) => r.official_url === fullUrl)) return
    races.push({ name: text, official_url: fullUrl, entry_url: fullUrl, race_type: RACE_TYPE, source: SOURCE_NAME })
  })
  return ctx.limitForEnv(races, 5)
}
