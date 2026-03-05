/**
 * 初期データ投入スクリプト
 * data/seed.json を読み込み、yabai_travel.events に INSERT
 * 将来は別ソース（スクレイピング・API）に差し替え可能な構造
 */
import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL が設定されていません。')
  process.exit(1)
}

const client = new pg.Client({ connectionString: url })

async function run() {
  const seedPath = join(__dirname, '../data/seed.json')
  const raw = readFileSync(seedPath, 'utf8')
  const items = JSON.parse(raw)

  try {
    await client.connect()

    for (const item of items) {
      await client.query(
        `INSERT INTO yabai_travel.events (name, event_date, location, race_type, official_url, entry_url)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          item.name,
          item.event_date,
          item.location ?? null,
          item.race_type ?? null,
          item.official_url ?? null,
          item.entry_url ?? null,
        ]
      )
    }
    console.log(`${items.length} 件のイベントを投入しました。`)
  } finally {
    await client.end()
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
