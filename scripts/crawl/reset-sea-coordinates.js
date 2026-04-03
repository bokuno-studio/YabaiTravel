/**
 * 海上座標を持つイベントの latitude/longitude をリセット
 * geocoding精度問題で海上に表示されているレコードを特定・修正
 *
 * 使い方:
 *   node scripts/crawl/reset-sea-coordinates.js              # 実行
 *   node scripts/crawl/reset-sea-coordinates.js --dry-run    # 確認のみ（UPDATE なし）
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

// 海上座標判定 — enrich-event.js と同じロジック
function isSeaCoordinate(lat, lng) {
  if (lat === null || lng === null) return false

  // 1. 太平洋沖（東経>145度 または 北緯<30度 かつ 東経>143度）
  if (lng > 145 || (lat < 30 && lng > 143)) return true

  // 2. 日本海沖（北緯>40度 かつ 東経<138度）
  if (lat > 40 && lng < 138) return true

  // 3. 東シナ海（北緯<32度 かつ 東経<130度）
  if (lat < 32 && lng < 130) return true

  // 4. フィリピン海（北緯<24度 かつ 東経>130度）
  if (lat < 24 && lng > 130) return true

  return false
}

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  console.log(`=== 海上座標リセット開始 (DRY_RUN: ${DRY_RUN}) ===\n`)

  // 座標を持つ全イベントを取得
  const { rows: allEvents } = await client.query(`
    SELECT id, name, location, latitude, longitude FROM ${SCHEMA}.events
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
    ORDER BY updated_at DESC
  `)

  // 海上座標を持つものをフィルタ
  const seaCoordinates = allEvents.filter(e => isSeaCoordinate(e.latitude, e.longitude))

  console.log(`対象: ${seaCoordinates.length} 件 (全 ${allEvents.length} 件中)\n`)

  if (seaCoordinates.length === 0) {
    console.log('海上座標は見つかりませんでした。')
    await client.end()
    return
  }

  let resetCount = 0

  for (let i = 0; i < seaCoordinates.length; i++) {
    const { id, name, location, latitude, longitude } = seaCoordinates[i]

    if (!DRY_RUN) {
      await client.query(
        `UPDATE ${SCHEMA}.events SET latitude = NULL, longitude = NULL, updated_at = NOW() WHERE id = $1`,
        [id]
      )
    }

    console.log(`  [${i + 1}/${seaCoordinates.length}] RESET: ${name?.slice(0, 50)} | ${location?.slice(0, 40)} | (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`)
    resetCount++
  }

  console.log(`\n完了:`)
  console.log(`  - リセット: ${resetCount} 件`)
  if (DRY_RUN) {
    console.log(`  - DB 更新: なし（DRY_RUN）`)
  }

  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
