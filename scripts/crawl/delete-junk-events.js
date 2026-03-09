/**
 * ゴミデータ（誤抽出）の events を削除
 * categories, access_routes, accommodations は CASCADE で自動削除
 *
 * 使い方: node scripts/crawl/delete-junk-events.js
 */
import pg from 'pg'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  })
}

const JUNK_PATTERNS = [
  /TICKET PRICES RISE.*REGISTER NOW/i,
  /^エントリー\s*\d{4}\.\d{2}\.\d{2}/m,
  /^【スポーツの話題はこちら】/,
  /^プレスリリース$/i,
  /^主催者の皆さまへ$/i,
  /^大会主催者の方へ$/i,
  /^Online Shop$/i,
  /^エントリーガイド$/i,
  /^shopping_cart$/i,
  /^Sign in$/i,
  /^Orders$/i,
  /^ARE YOU READY\? SAY OORAH$/i,
]

async function run() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  const { rows } = await client.query(
    'SELECT id, name, official_url FROM yabai_travel.events'
  )

  const toDelete = rows.filter((r) => JUNK_PATTERNS.some((p) => p.test(r.name?.trim() ?? '')))
  console.log(`ゴミ候補: ${toDelete.length} 件`)
  toDelete.forEach((r) => console.log(`  - ${r.name?.slice(0, 50)}... (${r.official_url})`))

  for (const r of toDelete) {
    await client.query('DELETE FROM yabai_travel.events WHERE id = $1', [r.id])
    console.log(`削除: ${r.name?.slice(0, 40)}`)
  }

  await client.end()
  console.log(`\n完了: ${toDelete.length} 件削除`)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
