/**
 * A-Extremo 詳細ページ（round01, round02 等）から 参加費・距離・交通・受付・会場・締切 を抽出
 */
import * as cheerio from 'cheerio'

/**
 * @param {string} html - 詳細ページの HTML
 * @returns {{ distance_km: number | null, entry_fee: number | null, entry_fee_text: string | null, route_detail: string | null, entry_end: string | null, reception_place: string | null, start_place: string | null, start_time: string | null }}
 */
export function extract(html) {
  const $ = cheerio.load(html)
  let distance_km = null
  let entry_fee = null
  let entry_fee_text = null
  let route_detail = null
  let entry_end = null
  let reception_place = null
  let start_place = null
  let start_time = null

  const bodyText = $('#main_base').text()

  // 応募締切日：2026年04月01日（水）
  const entryEndMatch = bodyText.match(/応募締切日[：:]\s*(\d{4})年(\d{1,2})月(\d{1,2})日/)
  if (entryEndMatch) {
    entry_end = `${entryEndMatch[1]}-${entryEndMatch[2].padStart(2, '0')}-${entryEndMatch[3].padStart(2, '0')}`
  }

  // テーブル: th と td のペア
  $('#main_base table tr').each((_, tr) => {
    const th = $(tr).find('th').text().trim()
    const td = $(tr).find('td').text().trim()
    if (th === '距離' && td) {
      const m = td.match(/(\d+)[～\-〜]?(\d+)?\s*km/)
      distance_km = m ? parseInt(m[1], 10) : null
    }
    if (th === '参加費' && td) {
      entry_fee_text = td.replace(/\s+/g, ' ').trim()
      const m = entry_fee_text.match(/(\d{1,3}(?:,\d{3})*)\s*円/)
      entry_fee = m ? parseInt(m[1].replace(/,/g, ''), 10) : null
    }
    if (th === '会場' && td) {
      start_place = td.replace(/\s+/g, ' ').trim() || null
    }
  })

  // 会場: オオムラサキ公園（那須烏山市大木須）形式の行
  if (!start_place) {
    const koenIdx = bodyText.indexOf('公園')
    if (koenIdx >= 0) {
      const closeIdx = bodyText.indexOf('）', koenIdx)
      if (closeIdx > koenIdx) {
        const lineStart = bodyText.lastIndexOf('\n', koenIdx) + 1
        start_place = bodyText.slice(lineStart, closeIdx + 1).trim()
      }
    }
  }

  // 受付・装備チェック 11:00～12:15、レーススタート 13:30
  const receptionMatch = bodyText.match(/(\d{1,2}:\d{2})[～\-〜]\s*(?:\d{1,2}:\d{2})?\s*受付/)
  if (receptionMatch) reception_place = `受付 ${receptionMatch[1]}〜`
  const startMatch = bodyText.match(/(\d{1,2}:\d{2})\s*レーススタート/)
  if (startMatch) start_time = startMatch[1]

  // 交通: 「・車利用」「・電車利用」のブロック
  const blocks = []
  $('#main_base').find('p').each((_, el) => {
    const text = $(el).text().trim()
    if (text.startsWith('・車利用') || text.startsWith('・電車利用')) {
      blocks.push(text)
    }
  })
  if (blocks.length) route_detail = blocks.join('\n')

  return {
    distance_km,
    entry_fee,
    entry_fee_text,
    route_detail,
    entry_end,
    reception_place,
    start_place,
    start_time,
  }
}
