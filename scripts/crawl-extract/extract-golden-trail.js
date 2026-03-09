/**
 * Golden Trail World Series 抽出スクリプト（Cheerio）
 * https://goldentrailseries.com/serie/world-series/
 *
 * 出力: SPEC_BACKEND_FLOW の形式に準拠した JSON
 */
import * as cheerio from 'cheerio'

const SOURCE_URL = 'https://goldentrailseries.com/serie/world-series/'

/** DD/MM/YYYY を YYYY-MM-DD に変換 */
function parseDate(str) {
  const m = str.trim().match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!m) return null
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

/**
 * HTML からレース情報を抽出
 * @param {string} html - ページの HTML
 * @returns {{ source: string, races: Array<{ name: string, event_date: string, official_url: string, location: string, race_type: string }> }}
 */
export function extract(html) {
  const $ = cheerio.load(html)
  const races = []

  $('a.slide.group\\/race').each((_, el) => {
    const $slide = $(el)
    const href = $slide.attr('href')
    const officialUrl = href?.startsWith('http') ? href : new URL(href || '', SOURCE_URL).href

    // 日付: absolute bottom-0 内の span (DD/MM/YYYY)
    let eventDate = null
    $slide.find('.absolute.bottom-0 span.text-off-black').each((__, spanEl) => {
      const text = $(spanEl).text().trim()
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)) {
        eventDate = parseDate(text)
        return false // break
      }
    })

    // レース名: slide-title span
    const name = $slide.find('.slide-title span').first().text().trim() || $slide.find('img[alt]').attr('alt') || ''

    if (name) {
      races.push({
        name,
        event_date: eventDate,
        official_url: officialUrl,
        entry_url: officialUrl,
        location: null, // 詳細ページにあり
        race_type: 'trail',
      })
    }
  })

  return { source: SOURCE_URL, races }
}
