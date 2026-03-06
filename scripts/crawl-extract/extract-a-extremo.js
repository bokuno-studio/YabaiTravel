/**
 * A-Extremo エクストリームシリーズ 抽出スクリプト（Cheerio）
 * https://www.a-extremo.com/event/extreme/
 *
 * 出力: SPEC_BACKEND_FLOW の形式に準拠した JSON
 */
import * as cheerio from 'cheerio'

const SOURCE_URL = 'https://www.a-extremo.com/event/extreme/'

/** 日本語日付を YYYY-MM-DD に変換 */
function parseJpDate(str) {
  const m = str.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
  if (!m) return null
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}

/**
 * HTML からレース情報を抽出
 * @param {string} html - ページの HTML
 * @returns {{ source: string, races: Array<{ name: string, event_date: string, official_url: string, entry_url: string, location: string, entry_end: string }> }}
 */
export function extract(html) {
  const $ = cheerio.load(html)
  const races = []

  // テーブル: 0=ヘッダー, 1=開催日, 2=応募締切, 3=詳細リンク
  const rows = $('#main_base table tbody tr')
  if (rows.length < 4) return { source: SOURCE_URL, races: [] }

  const dateRow = $(rows[1])
  const linkRow = $(rows[3])

  // ヘッダー行から大会名を取得（th の 2〜6 列目）
  const headerRow = $(rows[0])
  const names = []
  headerRow.find('th').each((i, el) => {
    if (i === 0) return
    const text = $(el).find('p').first().text().trim()
    if (text) names.push(text.replace('大会', '').trim())
  })

  // 開催日（td は 5 列、スキップなし）
  const dates = []
  dateRow.find('td').each((_, el) => {
    const text = $(el).text().trim()
    const parsed = parseJpDate(text)
    if (parsed) dates.push(parsed)
  })

  // 詳細リンク（td は 5 列、スキップなし。name[i] と entryEnds[i] を対応させる）
  const entryEnds = []
  const entryRow = $(rows[3])
  entryRow.find('td').each((_, el) => {
    const link = $(el).find('a[href*="round"]')
    if (link.length) {
      const href = link.attr('href')
      const fullUrl = href.startsWith('http') ? href : new URL(href, SOURCE_URL).href
      entryEnds.push({ url: fullUrl })
    }
  })

  // 場所マッピング（サイトの記載順）
  const locations = {
    那珂川: '栃木県那須烏山市',
    奥多摩: '東京都奥多摩町',
    '福島ならは': '福島県楢葉町',
    奥大井: '静岡県川根本町',
    尾瀬檜枝岐: '福島県檜枝岐村',
  }

  for (let i = 0; i < names.length; i++) {
    const name = names[i] ? `${names[i]}大会` : `レース${i + 1}`
    races.push({
      name: `エクストリームシリーズ ${name}`,
      event_date: dates[i] ?? null,
      official_url: entryEnds[i]?.url ?? SOURCE_URL,
      entry_url: entryEnds[i]?.url ?? SOURCE_URL,
      location: locations[names[i]] ?? null,
      entry_end: null, // 応募締切は別行にあるが簡略化
      race_type: 'adventure',
    })
  }

  return { source: SOURCE_URL, races }
}
