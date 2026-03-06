/**
 * 抽出テストスクリプト実行
 * 各ソースをフェッチして抽出し、JSON を出力
 *
 * 使い方:
 *   node scripts/crawl-extract/run-extract.js [a-extremo|golden-trail|all]  # Cheerio（無料）
 *   node scripts/crawl-extract/extract-with-claude.js [a-extremo|golden-trail]  # Claude（有料）
 */
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { extract as extractAExtremo } from './extract-a-extremo.js'
import { extract as extractGoldenTrail } from './extract-golden-trail.js'

// .env.local 読み込み
const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  })
}

const SOURCES = {
  'a-extremo': {
    url: 'https://www.a-extremo.com/event/extreme/',
    extract: extractAExtremo,
  },
  'golden-trail': {
    url: 'https://goldentrailseries.com/serie/world-series/',
    extract: extractGoldenTrail,
  },
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'YabaiTravel-Crawl/1.0 (extraction test)' },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`Fetch failed ${url}: ${res.status}`)
  return res.text()
}

async function run(sourceKey) {
  const keys = sourceKey === 'all' ? Object.keys(SOURCES) : [sourceKey]
  if (!keys.every((k) => k in SOURCES)) {
    console.error('Usage: node run-extract.js [a-extremo|golden-trail|all]')
    process.exit(1)
  }

  const results = []
  for (const key of keys) {
    const { url, extract } = SOURCES[key]
    console.error(`Fetching ${key}...`)
    const html = await fetchHtml(url)
    const result = extract(html)
    result.source_key = key
    results.push(result)
    console.error(`  → ${result.races.length} races extracted`)
  }

  console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2))
}

const arg = process.argv[2] || 'all'
run(arg).catch((err) => {
  console.error(err)
  process.exit(1)
})
