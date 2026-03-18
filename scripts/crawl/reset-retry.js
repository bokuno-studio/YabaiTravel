/**
 * #192: enrich リトライリセットCLI
 * バグ修正後などに last_error_type をリセットして再試行対象に戻す
 *
 * 使い方:
 *   node scripts/crawl/reset-retry.js --error-type bug          # bugエラーを全リセット
 *   node scripts/crawl/reset-retry.js --error-type not_available # not_availableを全リセット
 *   node scripts/crawl/reset-retry.js --event-id <uuid>          # 特定イベントをリセット
 *   node scripts/crawl/reset-retry.js --dry-run --error-type bug # 確認のみ
 */
import pg from 'pg'
import { loadEnv } from './lib/enrich-utils.js'

loadEnv()
const SCHEMA = process.env.SUPABASE_SCHEMA ?? 'yabai_travel'

async function main() {
  const args = process.argv.slice(2)
  const DRY_RUN = args.includes('--dry-run')
  const errorTypeIdx = args.indexOf('--error-type')
  const eventIdIdx = args.indexOf('--event-id')
  const ERROR_TYPE = errorTypeIdx >= 0 ? args[errorTypeIdx + 1] : null
  const EVENT_ID = eventIdIdx >= 0 ? args[eventIdIdx + 1] : null

  if (!ERROR_TYPE && !EVENT_ID) {
    console.error('使い方: --error-type <bug|not_available|temporary> または --event-id <uuid> を指定してください')
    process.exit(1)
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  let whereClause, params
  if (EVENT_ID) {
    whereClause = 'WHERE id = $1'
    params = [EVENT_ID]
  } else {
    whereClause = 'WHERE last_error_type = $1'
    params = [ERROR_TYPE]
  }

  // 対象件数を確認
  const { rows: targets } = await client.query(
    `SELECT id, name, last_error_type, last_attempted_at FROM ${SCHEMA}.events ${whereClause} ORDER BY name LIMIT 50`,
    params
  )

  if (targets.length === 0) {
    console.log('対象なし')
    await client.end()
    return
  }

  console.log(`対象: ${targets.length} 件${DRY_RUN ? ' (DRY RUN)' : ''}`)
  for (const row of targets) {
    console.log(`  ${row.name?.slice(0, 50)} | error_type: ${row.last_error_type} | last_attempted: ${row.last_attempted_at?.slice(0, 10)}`)
  }

  if (!DRY_RUN) {
    const { rowCount } = await client.query(
      `UPDATE ${SCHEMA}.events SET last_error_type = NULL, last_attempted_at = NULL ${whereClause}`,
      params
    )
    console.log(`\n✅ ${rowCount} 件をリセットしました`)
  }

  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
