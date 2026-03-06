/**
 * 系統A: レース詳細のクロール実行
 * 少数ソース（A-Extremo, Golden Trail）をフェッチ→抽出→DB UPSERT
 *
 * 使い方: npm run crawl:run
 * 手動トリガーで即時実行（cron 不要）
 */
import pg from 'pg'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { extract as extractAExtremo } from '../crawl-extract/extract-a-extremo.js'
import { extract as extractGoldenTrail } from '../crawl-extract/extract-golden-trail.js'

// .env.local 読み込み
const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  })
}

const SOURCES = [
  { key: 'a-extremo', url: 'https://www.a-extremo.com/event/extreme/', extract: extractAExtremo },
  { key: 'golden-trail', url: 'https://goldentrailseries.com/serie/world-series/', extract: extractGoldenTrail },
]

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'YabaiTravel-Crawl/1.0' },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`Fetch failed ${url}: ${res.status}`)
  return res.text()
}

async function run() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL が未設定です')
    process.exit(1)
  }

  const client = new pg.Client({ connectionString: databaseUrl })
  await client.connect()

  try {
    let inserted = 0
    for (const { key, url, extract } of SOURCES) {
      console.log(`[${key}] Fetching...`)
      const html = await fetchHtml(url)
      const { races } = extract(html)
      console.log(`[${key}] ${races.length} races extracted`)

      for (const r of races) {
        if (!r.official_url || !r.event_date) {
          console.log(`  Skip (missing url/date): ${r.name}`)
          continue
        }

        const exists = await client.query(
          `SELECT id FROM yabai_travel.events WHERE official_url = $1`,
          [r.official_url]
        )
        if (exists.rows.length > 0) {
          console.log(`  Skip (exists): ${r.name}`)
          continue
        }

        const eventResult = await client.query(
          `INSERT INTO yabai_travel.events (
            name, event_date, location, country, race_type, official_url, entry_url
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id`,
          [
            r.name,
            r.event_date || null,
            r.location || null,
            null,
            r.race_type || null,
            r.official_url,
            r.entry_url || r.official_url,
          ]
        )
        const eventId = eventResult.rows[0].id

        // カテゴリは1件（デフォルト名。後から詳細で上書き可能）
        await client.query(
          `INSERT INTO yabai_travel.categories (event_id, name) VALUES ($1, $2)`,
          [eventId, 'メイン']
        )

        inserted++
        console.log(`  Inserted: ${r.name}`)
      }
    }
    console.log(`\nDone. ${inserted} new events inserted.`)
  } finally {
    await client.end()
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
