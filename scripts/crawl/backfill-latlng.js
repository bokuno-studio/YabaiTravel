/**
 * lat/lng NULL を持つイベントの再geocoding
 * location あり・lat/lng NULL のイベント238件をGoogle Geocoding APIで再処理
 *
 * 使い方:
 *   node scripts/crawl/backfill-latlng.js              # 実行
 *   node scripts/crawl/backfill-latlng.js --dry-run    # 確認のみ（UPDATE なし）
 */
import pg from 'pg'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const envPath = resolve('.env.local')
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  })
}

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')

const SCHEMA = process.env.SUPABASE_SCHEMA ?? 'yabai_travel'
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY
const SLEEP_MS = 200

if (!GOOGLE_API_KEY) {
  console.error('エラー: GOOGLE_API_KEY が設定されていません')
  process.exit(1)
}

/** sleep 関数 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** geocodeLocation 関数（enrich-event.js と同じロジック） */
async function geocodeLocation(location, apiKey) {
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${apiKey}`
  )
  const data = await res.json()
  if (data.status !== 'OK' || !data.results?.length) return null
  const result = data.results[0]
  const locationType = result.geometry.location_type
  if (locationType === 'GEOMETRIC_CENTER' || locationType === 'APPROXIMATE') return null
  return result.geometry.location // { lat, lng }
}

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  console.log(`=== lat/lng backfill 開始 (DRY_RUN: ${DRY_RUN}) ===\n`)

  // 対象レコードを取得
  const { rows: targets } = await client.query(`
    SELECT id, name, location FROM ${SCHEMA}.events
    WHERE location IS NOT NULL
      AND (latitude IS NULL OR longitude IS NULL)
      AND status != 'archived'
    ORDER BY updated_at DESC
  `)

  console.log(`対象: ${targets.length} 件\n`)

  let successCount = 0
  let skipCount = 0

  for (let i = 0; i < targets.length; i++) {
    const { id, name, location } = targets[i]
    try {
      const result = await geocodeLocation(location, GOOGLE_API_KEY)
      if (!result) {
        console.log(`  [${i + 1}/${targets.length}] SKIP (低精度): ${name?.slice(0, 50)} | ${location?.slice(0, 40)}`)
        skipCount++
      } else {
        if (!DRY_RUN) {
          await client.query(
            `UPDATE ${SCHEMA}.events SET latitude = $1, longitude = $2, updated_at = NOW() WHERE id = $3`,
            [result.lat, result.lng, id]
          )
        }
        console.log(`  [${i + 1}/${targets.length}] UPDATE: ${name?.slice(0, 50)} | lat=${result.lat.toFixed(4)}, lng=${result.lng.toFixed(4)}`)
        successCount++
      }
    } catch (e) {
      console.warn(`  [${i + 1}/${targets.length}] ERROR: ${name?.slice(0, 50)} | ${e.message}`)
    }

    // rate limit 対策
    if (i < targets.length - 1) {
      await sleep(SLEEP_MS)
    }
  }

  console.log(`\n完了:`)
  console.log(`  - 成功: ${successCount} 件`)
  console.log(`  - スキップ（低精度）: ${skipCount} 件`)
  if (DRY_RUN) {
    console.log(`  - DB 更新: なし（DRY_RUN）`)
  }

  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
