/**
 * ④ オーケストレータ
 * 未処理 or 空フィールドあり（7日以内に再試行済みを除く）のイベントを並列5件で処理
 *
 * 使い方:
 *   node scripts/crawl/orchestrator.js              # 全件
 *   node scripts/crawl/orchestrator.js --dry-run    # DB更新なし
 *   node scripts/crawl/orchestrator.js --once       # 1バッチのみ
 *   node scripts/crawl/orchestrator.js --concurrency 10
 */
import pg from 'pg'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { enrichDetail } from './enrich-detail.js'
import { enrichLogi } from './enrich-logi.js'

const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  })
}

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const ONCE = args.includes('--once')
const concurrencyIdx = args.indexOf('--concurrency')
const CONCURRENCY = concurrencyIdx >= 0 ? parseInt(args[concurrencyIdx + 1], 10) : 5

const SCHEMA = process.env.SUPABASE_SCHEMA ?? 'yabai_travel'

/** 配列を chunk サイズに分割 */
function chunkArray(arr, size) {
  const chunks = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

async function run() {
  console.log(`=== オーケストレータ開始 (DRY_RUN: ${DRY_RUN}, CONCURRENCY: ${CONCURRENCY}, ONCE: ${ONCE}) ===\n`)

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  const { rows: pendingEvents } = await client.query(
    `SELECT id, name, official_url, location, country
     FROM ${SCHEMA}.events
     WHERE (
       collected_at IS NULL
       OR event_date IS NULL
       OR location IS NULL
       OR country IS NULL
       OR race_type IS NULL
     )
     AND (last_attempted_at IS NULL OR last_attempted_at < NOW() - INTERVAL '7 days')
     ORDER BY
       CASE WHEN collected_at IS NULL THEN 0 ELSE 1 END,
       updated_at ASC`
  )

  await client.end()

  console.log(`処理対象イベント: ${pendingEvents.length} 件\n`)

  if (pendingEvents.length === 0) {
    console.log('処理対象なし。終了します。')
    return
  }

  const batches = chunkArray(pendingEvents, CONCURRENCY)
  let totalDetailOk = 0
  let totalDetailErr = 0
  let totalLogiOk = 0
  let totalLogiErr = 0

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx]
    const batchNum = batchIdx + 1

    console.log(`--- バッチ ${batchNum}/${batches.length} (${batch.length} 件) ---`)

    await Promise.allSettled(
      batch.map(async (event) => {
        // detail → logi の順で直列実行（logi は detail が書いた location を使うため）
        const detailResult = await enrichDetail(event, { dryRun: DRY_RUN }).catch((e) => ({ success: false, error: e.message }))
        if (detailResult.success) {
          totalDetailOk++
          console.log(`  [detail] OK  ${event.name?.slice(0, 40)}`)
        } else {
          totalDetailErr++
          console.log(`  [detail] ERR ${event.name?.slice(0, 40)} | ${detailResult.error?.slice(0, 50)}`)
        }

        // enrichDetail が書き込んだ location を反映してから logi を呼ぶ
        const enrichedEvent = detailResult.location ? { ...event, location: detailResult.location } : event

        const logiResult = await enrichLogi(enrichedEvent, { dryRun: DRY_RUN }).catch((e) => ({ success: false, error: e.message }))
        if (logiResult.success) {
          totalLogiOk++
          console.log(`  [logi]   OK  ${event.name?.slice(0, 40)}`)
        } else {
          totalLogiErr++
          console.log(`  [logi]   ERR ${event.name?.slice(0, 40)} | ${logiResult.error?.slice(0, 50)}`)
        }
      })
    )

    console.log()

    if (ONCE) {
      console.log('--once フラグにより1バッチで終了します。')
      break
    }
  }

  console.log('=== サマリー ===')
  console.log(`詳細エンリッチ: OK ${totalDetailOk} / ERR ${totalDetailErr}`)
  console.log(`ロジエンリッチ: OK ${totalLogiOk} / ERR ${totalLogiErr}`)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
