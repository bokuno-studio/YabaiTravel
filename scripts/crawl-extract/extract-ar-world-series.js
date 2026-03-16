/**
 * Adventure Racing World Series (ARWS) 抽出スクリプト（Cheerio）
 * https://arworldseries.com/races
 *
 * レース一覧ページから全レース情報を抽出する。
 * 構造: div.search-item > (race-date, race-name, race-dates, race-locations)
 * 出力: SPEC_BACKEND_FLOW の形式に準拠した JSON
 */
import * as cheerio from 'cheerio'

const SOURCE_URL = 'https://arworldseries.com/races'
const BASE_URL = 'https://arworldseries.com'

const MONTH_MAP = {
  jan: '01', feb: '02', mar: '03', apr: '04',
  may: '05', jun: '06', jul: '07', aug: '08',
  sep: '09', oct: '10', nov: '11', dec: '12',
}

/**
 * "DD Mon - DD Mon YYYY" or "DD Mon YYYY" 形式の日付文字列を YYYY-MM-DD に変換
 * 開始日を返す
 * @param {string} str
 * @returns {string|null}
 */
function parseDate(str) {
  if (!str) return null
  const cleaned = str.replace(/\(Past Race\)/i, '').replace(/Current Race/i, '').trim()

  // "08 Mar - 13 Mar 2026" or "08 Mar 2026"
  // Also handles "27 Sep - 10 Oct 2026" (cross-month ranges)
  const rangeMatch = cleaned.match(
    /(\d{1,2})\s+([A-Za-z]{3})\s*(?:-\s*\d{1,2}\s+[A-Za-z]{3})?\s+(\d{4})/,
  )
  if (rangeMatch) {
    const day = rangeMatch[1].padStart(2, '0')
    const month = MONTH_MAP[rangeMatch[2].toLowerCase()]
    const year = rangeMatch[3]
    if (month) return `${year}-${month}-${day}`
  }

  // "25 Apr" (no year) - assume current or next year
  const shortMatch = cleaned.match(/(\d{1,2})\s+([A-Za-z]{3})/)
  if (shortMatch) {
    const day = shortMatch[1].padStart(2, '0')
    const month = MONTH_MAP[shortMatch[2].toLowerCase()]
    if (month) {
      const now = new Date()
      const year = now.getFullYear()
      return `${year}-${month}-${day}`
    }
  }

  return null
}

/**
 * HTML からレース情報を抽出
 * @param {string} html - ページの HTML
 * @returns {{ source: string, races: Array<{ name: string, event_date: string|null, official_url: string, entry_url: string, location: string|null, race_type: string }> }}
 */
export function extract(html) {
  const $ = cheerio.load(html)
  const races = []
  const seen = new Set()

  // 各レースカードは div.search-item
  $('div.search-item').each((_, el) => {
    const $item = $(el)

    // レース名: h4.race-name 内の最後の a タグ（内側の a が実際のリンク）
    const $raceName = $item.find('h4.race-name')
    let name = ''
    let raceUrl = ''

    // race-name 内には入れ子の a タグがある。内側の a を取得
    const $links = $raceName.find('a')
    $links.each((__, linkEl) => {
      const href = $(linkEl).attr('href') || ''
      const text = $(linkEl).text().trim()
      // /races/ で始まるリンクがレース詳細ページ
      if (href.startsWith('/races/') && text) {
        name = text
        raceUrl = href
      }
    })

    if (!name) return

    // 重複チェック（同じ URL のレースをスキップ）
    if (raceUrl && seen.has(raceUrl)) return
    if (raceUrl) seen.add(raceUrl)

    const officialUrl = raceUrl
      ? (raceUrl.startsWith('http') ? raceUrl : `${BASE_URL}${raceUrl}`)
      : ''

    // 日付: div.race-dates のテキスト
    const dateText = $item.find('div.race-dates').text().trim()
    const eventDate = parseDate(dateText)

    // ロケーション: div.race-locations のテキスト（説明文が入っているため短縮）
    let location = null
    const locText = $item.find('div.race-locations').text().trim()
    // URL のスラグからロケーション情報を推測
    if (raceUrl) {
      // "/races/tierra-indomita-vulcania-2026-chile" → "chile"
      const slugParts = raceUrl.split('-')
      const lastPart = slugParts[slugParts.length - 1]
      if (lastPart && lastPart !== raceUrl) {
        // 国名を大文字に
        location = lastPart.charAt(0).toUpperCase() + lastPart.slice(1)
      }
    }
    // 説明文が短ければそのまま使う
    if (locText && locText.length < 100) {
      location = locText
    }

    // シリーズ名（ARWS region）
    const seriesText = $raceName.find('span span').first().text().trim()

    races.push({
      name,
      event_date: eventDate,
      official_url: officialUrl,
      entry_url: officialUrl,
      location,
      race_type: 'adventure',
    })
  })

  return { source: SOURCE_URL, races }
}
