/**
 * UTMB World Series イベント一覧ページからレース情報を抽出
 */
import * as cheerio from 'cheerio'

/** "14 - 15 March 2026" 等を YYYY-MM-DD に変換（開始日を使用） */
function parseDate(str) {
  const months = { January: 1, February: 2, March: 3, April: 4, May: 5, June: 6, July: 7, August: 8, September: 9, October: 10, November: 11, December: 12 }
  const m = str.trim().match(/(\d{1,2})\s*(?:-\s*\d{1,2})?\s+([A-Za-z]+)\s+(\d{4})/)
  if (!m) return null
  const mon = months[m[2]]
  if (!mon) return null
  return `${m[3]}-${String(mon).padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

const SOURCE_URL = 'https://utmb.world/utmb-world-series-events'

/**
 * @param {string} html
 * @returns {{ races: Array<{ name: string, event_date: string, official_url: string, entry_url: string, location: string, race_type: string }> }}
 */
export function extract(html) {
  const $ = cheerio.load(html)
  const races = []

  // 地域セクション内のリンク: [14 - 15 March 2026](https://xiamen.utmb.world/)
  $('a[href*="utmb.world"]').each((_, el) => {
    const $a = $(el)
    const href = $a.attr('href')
    const text = $a.text().trim()
    if (!href || !text || href.includes('utmb-world-series-events')) return

    const officialUrl = href.startsWith('http') ? href : `https://${href}`
    const eventDate = parseDate(text)
    const name = href.replace(/https?:\/\/([^.]+)\.utmb\.world.*/, '$1').replace(/-/g, ' ')

    if (eventDate) {
      races.push({
        name: name.charAt(0).toUpperCase() + name.slice(1) + ' by UTMB',
        event_date: eventDate,
        official_url: officialUrl,
        entry_url: officialUrl,
        location: null,
        race_type: 'trail',
      })
    }
  })

  return { races }
}
