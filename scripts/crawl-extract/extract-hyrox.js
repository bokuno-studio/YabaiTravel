/**
 * HYROX Find My Race ページからレース情報を抽出
 */
import * as cheerio from 'cheerio'

/** "7. Mar. 2026" 等を YYYY-MM-DD に変換 */
function parseDate(str) {
  const months = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 }
  const m = str.trim().match(/(\d{1,2})\.\s*([A-Za-z]+)\.?\s*(\d{4})/)
  if (!m) return null
  const mon = months[m[2]]
  if (!mon) return null
  return `${m[3]}-${String(mon).padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

/**
 * @param {string} html
 * @returns {{ races: Array<{ name: string, event_date: string, official_url: string, entry_url: string, location: string, race_type: string }> }}
 */
export function extract(html) {
  const $ = cheerio.load(html)
  const races = []

  const seen = new Set()
  $('a[href*="hyrox.com/event/"]').each((_, el) => {
    const $a = $(el)
    const href = $a.attr('href')
    if (!href) return
    const officialUrl = href.startsWith('http') ? href : new URL(href, 'https://hyrox.com/').href
    if (seen.has(officialUrl)) return
    seen.add(officialUrl)

    const linkText = $a.text().trim()
    if (/^(Buy Tickets|Find out more|Tickets)$/i.test(linkText)) return

    const name = linkText.length > 5 ? linkText : null
    const $block = $a.closest('div, tr, section, article').first()
    const blockText = $block.length ? $block.text() : $a.parent().text()
    const dateMatch = blockText.match(/(\d{1,2})\.\s*([A-Za-z]+)\.?\s*(\d{4})/)
    const eventDate = dateMatch ? parseDate(dateMatch[0]) : null

    if (name && eventDate) {
      races.push({
        name,
        event_date: eventDate,
        official_url: officialUrl,
        entry_url: officialUrl,
        location: null,
        race_type: 'hyrox',
      })
      return false
    }
  })

  // 上記で取れない場合: h2 + 日付 + Buy Tickets リンクのパターン
  if (races.length === 0) {
    $('h2, h3').each((_, h) => {
      const $h = $(h)
      const name = $h.text().trim()
      const $next = $h.nextAll().slice(0, 5)
      let eventDate = null
      let entryUrl = null
      $next.find('a[href*="/event/"]').each((__, a) => {
        entryUrl = $(a).attr('href')
        if (entryUrl && !entryUrl.startsWith('http')) entryUrl = new URL(entryUrl, 'https://hyrox.com/').href
        return false
      })
      const text = $next.text()
      const dm = text.match(/(\d{1,2})\.\s*[A-Za-z]+\.?\s*(\d{4})/)
      if (dm) eventDate = parseDate(dm[0])
      if (name && eventDate && entryUrl) {
        races.push({
          name,
          event_date: eventDate,
          official_url: entryUrl,
          entry_url: entryUrl,
          location: null,
          race_type: 'hyrox',
        })
        return false
      }
    })
  }

  return { races }
}
