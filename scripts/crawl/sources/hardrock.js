/**
 * Hardrock 100 — qualifying races (from Google Spreadsheet CSV)
 */
import { extract as extractHardrock, extractFromCsv as extractHardrockCsv } from '../../crawl-extract/extract-hardrock.js'

export const SOURCE_NAME = 'hardrock'
export const RACE_TYPE = 'trail'

/**
 * Hardrock is special: HTML contains an iframe to a Google Spreadsheet.
 * We extract the CSV URL, fetch it, then parse the CSV.
 */
export async function parseAsync(html, url, _cheerioLoad, ctx) {
  const { _csvUrl } = extractHardrock(html)
  if (!_csvUrl) return []
  try {
    const csvRes = await fetch(_csvUrl, { redirect: 'follow' })
    if (!csvRes.ok) return []
    const csvText = await csvRes.text()
    const races = extractHardrockCsv(csvText)
    return races.map((r) => ({ ...r, source: SOURCE_NAME }))
  } catch (e) {
    console.warn('  Hardrock CSV fetch error:', e.message)
    return []
  }
}

export function matchesUrl(url) {
  return url.includes('hardrock100.com')
}
