/**
 * CHECK_TARGET_URLS の全 URL から 1 件ずつデータ取得を試行
 * 方針検討用。重複はスキップ。
 *
 * 使い方: node scripts/crawl/fetch-all-urls.js
 */
import pg from 'pg'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import * as cheerio from 'cheerio'
import { extract as extractAExtremo } from '../crawl-extract/extract-a-extremo.js'
import { extract as extractGoldenTrail } from '../crawl-extract/extract-golden-trail.js'

const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  })
}

/** CHECK_TARGET_URLS.md から URL を抽出 */
function parseUrls() {
  const path = resolve(process.cwd(), 'docs/data-sources/CHECK_TARGET_URLS.md')
  const content = readFileSync(path, 'utf8')
  const urls = []
  const lines = content.split('\n')
  for (const line of lines) {
    const m = line.match(/\|\s*(https:\/\/[^\s|]+)\s*\|/)
    if (m) urls.push(m[1].trim())
  }
  return [...new Set(urls)]
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'YabaiTravel-Crawl/1.0' },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.text()
}

/** URL に応じた抽出関数を返す */
function getExtractor(url) {
  if (url.includes('a-extremo.com/event/extreme')) return extractAExtremo
  if (url.includes('goldentrailseries.com')) return extractGoldenTrail
  return null
}

/** 汎用: 1件取得を試行（リンクとテキストを抽出） */
function tryGenericExtract(html, url) {
  const $ = cheerio.load(html)
  const links = []
  $('a[href^="http"]').each((_, el) => {
    const href = $(el).attr('href')
    const text = $(el).text().trim()
    if (href && text && text.length < 100) links.push({ href, text })
  })
  return links.length ? links[0] : null
}

async function run() {
  const urls = parseUrls()
  console.log(`Total URLs: ${urls.length}\n`)

  const client = process.env.DATABASE_URL
    ? new pg.Client({ connectionString: process.env.DATABASE_URL })
    : null
  if (client) await client.connect()

  const results = []
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]
    const extractor = getExtractor(url)
    try {
      const html = await fetchHtml(url)
      const item = extractor
        ? extractor(html).races[0]
        : tryGenericExtract(html, url)

      let skip = false
      if (client && item && item.official_url) {
        const exists = await client.query(
          `SELECT id FROM yabai_travel.events WHERE official_url = $1`,
          [item.official_url]
        )
        skip = exists.rows.length > 0
      }

      results.push({
        url,
        item: item ? (item.name || item.text) : null,
        extractor: extractor ? 'dedicated' : 'generic',
        skip,
      })
      console.log(
        `[${i + 1}/${urls.length}] ${skip ? 'SKIP' : 'OK'} ${item ? (item.name || item.text)?.slice(0, 40) : '—'}`
      )
    } catch (e) {
      results.push({ url, item: null, error: e.message })
      console.log(`[${i + 1}/${urls.length}] ERR ${e.message}`)
    }
  }

  if (client) await client.end()

  console.log('\n--- Summary ---')
  const ok = results.filter((r) => r.item && !r.skip).length
  const skip = results.filter((r) => r.skip).length
  const err = results.filter((r) => r.error).length
  console.log(`OK: ${ok}, Skip(dup): ${skip}, Error: ${err}`)

  // 結果をファイルに保存（確認用）
  const outPath = resolve(process.cwd(), 'scripts/crawl/fetch-all-urls-result.json')
  writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8')
  console.log(`\n結果を保存: ${outPath}`)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
