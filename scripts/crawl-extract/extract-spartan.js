/**
 * Spartan find-race ページからレース情報を抽出
 * 地域別 URL (jp.spartan.com/en 等) の /race/find-race をフェッチして使用
 */
import * as cheerio from 'cheerio'

/** Mon DD, YYYY を YYYY-MM-DD に変換 */
function parseDate(str) {
  const months = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 }
  const m = str.trim().match(/([A-Za-z]{3})\s+(\d{1,2}),?\s+(\d{4})/)
  if (!m) return null
  const mon = months[m[1]]
  if (!mon) return null
  return `${m[3]}-${String(mon).padStart(2, '0')}-${m[2].padStart(2, '0')}`
}

/**
 * @param {string} html - find-race ページの HTML
 * @param {string} baseUrl - ベース URL (例: https://jp.spartan.com/en)
 * @returns {{ races: Array<{ name: string, event_date: string, official_url: string, entry_url: string, location: string, race_type: string }> }}
 */
export function extract(html, baseUrl) {
  const $ = cheerio.load(html)
  const races = []
  const base = baseUrl.replace(/\/$/, '')

  $('a[href*="/races/"]').each((_, el) => {
    const $a = $(el)
    const href = $a.attr('href')
    if (!href || href.includes('find-race')) return

    const officialUrl = href.startsWith('http') ? href : new URL(href, base + '/').href
    const dateEl = $a.find('.date').first()
    const titleEl = $a.find('.title').first()
    const name = titleEl.text().trim() || $a.find('img[alt]').attr('alt') || ''
    const dateStr = dateEl.text().trim()
    const eventDate = parseDate(dateStr)

    // 場所は content 内の location 等から（構造はサイトにより異なる）
    let location = null
    $a.find('[class*="location"], [class*="place"]').each((__, locEl) => {
      const t = $(locEl).text().trim()
      if (t && t.length < 100) location = t
      return false
    })
    if (!location) {
      const locMatch = $a.text().match(/([A-Za-z\s]+,\s*[A-Z]{2})\s*[A-Za-z\s]*$/)
      if (locMatch) location = locMatch[1].trim()
    }

    if (name) {
      races.push({
        name,
        event_date: eventDate,
        official_url: officialUrl,
        entry_url: officialUrl,
        location,
        race_type: 'spartan',
      })
      return false // 1件のみ取得
    }
  })

  return { races }
}
