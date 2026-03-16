/**
 * Adventure1 Series 抽出スクリプト（Cheerio）
 * https://adventure1series.com/a1/
 *
 * カレンダーページ（WordPress）から月ごとのレース情報を抽出する。
 * 構造: h4 (月ヘッダー) → wp-block-columns → wp-block-column (h5 国名 + figure > a > img)
 * 出力: SPEC_BACKEND_FLOW の形式に準拠した JSON
 */
import * as cheerio from 'cheerio'

const SOURCE_URL = 'https://adventure1series.com/a1/'

const MONTH_MAP = {
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
}

/**
 * "MONTH YYYY" ヘッダーから年月を抽出
 * @param {string} str - e.g. "FEBRUARY 2025"
 * @returns {{ year: string, month: string }|null}
 */
function parseMonthHeader(str) {
  const m = str.trim().match(/^([A-Za-z]+)\s+(\d{4})$/)
  if (!m) return null
  const month = MONTH_MAP[m[1].toLowerCase()]
  if (!month) return null
  return { year: m[2], month }
}

/**
 * 画像ファイル名からレース名を推測する
 * e.g. "TrueWest-banner-2025-1.png" → "TrueWest"
 * e.g. "Blue-Ridge-2025-banner-1.png" → "Blue Ridge"
 * @param {string} src
 * @returns {string|null}
 */
function extractNameFromImage(src) {
  if (!src) return null
  // ファイル名を取得
  const filename = src.split('/').pop() || ''
  // 拡張子除去
  const base = filename.replace(/\.[^.]+$/, '')
  // "banner", 年号, サイズ指定を除去
  let name = base
    .replace(/[-_]?\d{3,4}x\d{3,4}$/i, '') // サイズ指定除去 (e.g. -1024x563)
    .replace(/[-_]?banner[-_]?/gi, ' ')
    .replace(/[-_]?\d{4}[-_]?/g, ' ')       // 年号除去
    .replace(/[-_]WC[-_]?/gi, ' ')           // "WC" 除去
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // 数字だけや1文字のみは無効
  if (!name || name.length <= 1 || /^\d+$/.test(name)) return null
  return name
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

  // 月ヘッダー (h4) を順にたどり、次の月ヘッダーまでの範囲内のレースを抽出
  let currentMonth = null

  // サイト内の全要素を走査して月ヘッダーとレースカードを検出
  const $main = $('main#main, .entry-content, .content-area').first()
  const $root = $main.length ? $main : $('body')

  // h4 タグを月ヘッダーとして処理
  $root.find('h4').each((_, headerEl) => {
    const headerText = $(headerEl).text().trim()
    const parsed = parseMonthHeader(headerText)
    if (parsed) {
      currentMonth = parsed
    }
  })

  // 月ヘッダーをベースに、各 wp-block-column 内のレースを抽出
  // h4 → 後続の wp-block-columns 内の wp-block-column に h5(国名) + figure > a(リンク)
  currentMonth = null

  $root.find('h4, .wp-block-column').each((_, el) => {
    const $el = $(el)

    // h4: 月ヘッダーの更新
    if (el.tagName === 'h4') {
      const headerText = $el.text().trim()
      const parsed = parseMonthHeader(headerText)
      if (parsed) {
        currentMonth = parsed
      }
      return
    }

    // wp-block-column: レースカード
    const $country = $el.find('h5').first()
    const $figure = $el.find('figure').first()
    const $link = $figure.find('a').first()
    const $img = $figure.find('img').first()

    if (!$country.length && !$figure.length) return

    const country = $country.length ? $country.text().trim() : null
    const href = $link.attr('href') || ''
    const imgSrc = $img.attr('src') || ''
    const imgAlt = $img.attr('alt') || ''

    // リンクも画像もなければスキップ
    if (!href && !imgSrc) return

    // レース名を推測: alt テキスト > 画像ファイル名 > リンクテキスト
    let name = imgAlt || extractNameFromImage(imgSrc) || $link.text().trim()
    if (!name && href) {
      // URL からレース名を推測
      try {
        const urlObj = new URL(href, 'https://adventure1series.com')
        const pathParts = urlObj.pathname.split('/').filter(Boolean)
        name = pathParts[pathParts.length - 1]
          ?.replace(/[-_]/g, ' ')
          ?.replace(/\b\w/g, (c) => c.toUpperCase()) || ''
      } catch {
        // ignore
      }
    }

    if (!name) return

    // official_url を正規化
    let officialUrl = href
    if (officialUrl && !officialUrl.startsWith('http')) {
      try {
        officialUrl = new URL(officialUrl, 'https://adventure1series.com').href
      } catch {
        officialUrl = ''
      }
    }

    // 重複チェック
    const key = officialUrl || name
    if (seen.has(key)) return
    seen.add(key)

    // 日付: 月の1日をデフォルトとする（正確な日付は個別ページにしかない）
    let eventDate = null
    if (currentMonth) {
      eventDate = `${currentMonth.year}-${currentMonth.month}-01`
    }

    races.push({
      name,
      event_date: eventDate,
      official_url: officialUrl || null,
      entry_url: officialUrl || null,
      location: country || null,
      race_type: 'adventure',
    })
  })

  return { source: SOURCE_URL, races }
}
