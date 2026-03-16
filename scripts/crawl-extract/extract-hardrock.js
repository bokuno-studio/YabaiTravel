/**
 * Hardrock 100 Qualifying Races パーサー
 * Google Spreadsheet (iframe埋め込み) から CSV エクスポートで取得
 *
 * ソース: https://hardrock100.com/hardrock-qualify.php
 * 実データ: Google Spreadsheet CSV export
 */

const SPREADSHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1J_aT3EF3IDIr5890BKRGjhltSBZmcADFTo7R0_4WBco/export?format=csv&gid=0'

/** "100mi" → 160.934, "163km" → 163, "120mi" → 193.121 等 */
function parseDistance(str) {
  const mi = str.match(/(\d+)\s*mi/i)
  if (mi) return Math.round(parseFloat(mi[1]) * 1.60934 * 10) / 10
  const km = str.match(/(\d+)\s*km/i)
  if (km) return parseFloat(km[1])
  return null
}

/** "(NZ)" → "New Zealand", "(France)" → "France" 等 */
function parseCountry(str) {
  const m = str.match(/\(([^)]+)\)/)
  if (!m) return null
  const abbr = {
    'NZ': 'New Zealand',
    'Australia': 'Australia',
    'Argentina': 'Argentina',
    'Norway': 'Norway',
    'Philippines': 'Philippines',
    'Canada': 'Canada',
    'Switzerland': 'Switzerland',
    'France': 'France',
    'Spain': 'Spain',
    'Bulgaria': 'Bulgaria',
    'Italy': 'Italy',
    'Japan': 'Japan',
    'Reunion Is': 'France',
    'South Africa': 'South Africa',
    'Mexico': 'Mexico',
    'UK': 'United Kingdom',
  }
  return abbr[m[1]] || m[1]
}

/**
 * Hardrock ページの HTML からスプレッドシート URL を抽出して CSV を取得・パース
 * @param {string} html - hardrock-qualify.php の HTML
 * @returns {{ races: Array<{ name, official_url, location, race_type, distance_km }> }}
 */
export function extract(html) {
  // iframe から Google Spreadsheet URL を抽出
  const iframeMatch = html.match(/src="(https:\/\/docs\.google\.com\/spreadsheets\/d\/[^"]+)"/)
  if (!iframeMatch) return { races: [], _csvUrl: SPREADSHEET_CSV_URL }

  // spreadsheet ID を抽出して CSV URL を生成
  const sheetIdMatch = iframeMatch[1].match(/\/d\/([^/]+)/)
  const csvUrl = sheetIdMatch
    ? `https://docs.google.com/spreadsheets/d/${sheetIdMatch[1]}/export?format=csv&gid=0`
    : SPREADSHEET_CSV_URL

  return { races: [], _csvUrl: csvUrl }
}

/**
 * CSV データからレース情報を抽出
 * collect-races.js から直接呼び出す
 * @param {string} csvText - CSV テキスト
 * @returns {Array<{ name, race_type, distance_km, location }>}
 */
export function extractFromCsv(csvText) {
  const races = []
  const lines = csvText.split('\n')

  for (const line of lines) {
    // "MONTH: Race Name 100mi (Country)" のパターン
    const match = line.match(/^([A-Z]+):\s*(.+?)(?:,|$)/)
    if (!match) continue

    const rawName = match[2].trim()
    // 距離を抽出
    const distanceKm = parseDistance(rawName)
    // 国を抽出
    const country = parseCountry(rawName)
    // レース名をクリーンアップ（距離と国を残す）
    const name = rawName.replace(/\s*\([^)]*\)\s*$/, '').trim()

    if (!name || name.includes('Event/Race')) continue

    races.push({
      name,
      official_url: null,  // 公式URLは enrich で Tavily 検索して取得
      race_type: 'trail',
      distance_km: distanceKm,
      location: country,
      country: country === 'Japan' ? '日本' : country,
    })
  }

  return races
}
