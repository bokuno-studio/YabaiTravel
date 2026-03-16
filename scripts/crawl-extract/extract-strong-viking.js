/**
 * Strong Viking チケットページからレース情報を抽出
 * https://strongviking.com/en/tickets/
 */
import * as cheerio from 'cheerio'

/** "sat 28 & sun 29 maart 2026", "Sat 11 & Sun 12 April 2026", "Sa april 11 2026" 等を YYYY-MM-DD に変換 */
function parseDate(str) {
  const months = { jan: 1, january: 1, feb: 2, february: 2, mar: 3, maart: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12 }
  const m = str.trim().match(/(\d{1,2})\s*(?:&|and)?\s*(?:[a-z]+\s+\d{1,2}\s+)?([a-z]+)\s+(\d{4})/i) || str.trim().match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/i)
  if (!m) return null
  const mon = months[m[2].toLowerCase()]
  if (!mon) return null
  return `${m[3]}-${String(mon).padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

const SOURCE_URL = 'https://strongviking.com/en/tickets/'

/**
 * @param {string} html
 * @returns {{ races: Array<{ name: string, event_date: string, official_url: string, entry_url: string, location: string, race_type: string }> }}
 */
export function extract(html) {
  const $ = cheerio.load(html)
  const races = []
  const seen = new Set()

  $('article.el_event, .elementor-post').each((_, article) => {
    const $art = $(article)
    const $link = $art.find('a[href*="obstacle-run/"]').first()
    const href = $link.attr('href')
    if (!href) return

    const officialUrl = href.startsWith('http') ? href : new URL(href, SOURCE_URL).href
    if (seen.has(officialUrl)) return
    seen.add(officialUrl)

    const name = $art.find('h2 .edition-bubble').first().text().trim() || $art.find('h2').first().text().trim()
    if (!name || name.length < 2) return

    let eventDate = null
    let location = null
    $art.find('h3').each((__, h3) => {
      const t = $(h3).text().trim()
      if (/\d{4}/.test(t)) eventDate = parseDate(t)
      else if (t.length < 40 && !/^(sat|sun|fri|sa|fr)\s/i.test(t)) location = t
    })

    if (name && eventDate) {
      races.push({
        name: `Strong Viking ${name} ${location || ''}`.trim(),
        event_date: eventDate,
        official_url: officialUrl,
        entry_url: officialUrl,
        location: location ? `${location}, Netherlands` : 'Netherlands',
        race_type: 'strong_viking',
      })
    }
  })

  return { races }
}
