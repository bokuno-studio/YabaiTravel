/**
 * #316 一回限りリセットスクリプト
 * 既存データを再enrich対象にリセットし、バイリンガル対応の再取得を促す
 *
 * 使い方:
 *   node scripts/crawl/reset-for-bilingual.js --dry-run    # 件数確認のみ
 *   node scripts/crawl/reset-for-bilingual.js              # 実行
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

const DRY_RUN = process.argv.includes('--dry-run')
const SCHEMA = process.env.SUPABASE_SCHEMA ?? 'yabai_travel'

async function run() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  console.log(`=== #316 バイリンガル移行リセット (DRY_RUN: ${DRY_RUN}) ===\n`)

  // 1. カテゴリ: collected_at IS NOT NULL だが entry_fee IS NULL のものをリセット
  //    （処理済みだが必須フィールドが取れていない → 再処理対象に）
  const { rows: [catReset] } = await client.query(
    `SELECT COUNT(*)::int as cnt FROM ${SCHEMA}.categories
     WHERE collected_at IS NOT NULL AND entry_fee IS NULL`
  )
  console.log(`カテゴリ（entry_fee未取得・再処理対象）: ${catReset.cnt} 件`)

  if (!DRY_RUN && catReset.cnt > 0) {
    await client.query(
      `UPDATE ${SCHEMA}.categories SET
        collected_at = NULL,
        attempt_count = 0,
        last_error_type = NULL,
        last_error_message = NULL
       WHERE collected_at IS NOT NULL AND entry_fee IS NULL`
    )
    console.log(`  → リセット完了`)
  }

  // 2. イベント: _en カラムが空のものを確認（移行スクリプトで対応予定）
  const { rows: [enNullEvents] } = await client.query(
    `SELECT COUNT(*)::int as cnt FROM ${SCHEMA}.events
     WHERE collected_at IS NOT NULL AND name_en IS NULL`
  )
  const { rows: [enSameEvents] } = await client.query(
    `SELECT COUNT(*)::int as cnt FROM ${SCHEMA}.events
     WHERE collected_at IS NOT NULL AND name_en = name AND name ~ '[ぁ-んァ-ヶ一-龥]'`
  )
  console.log(`\nイベント（name_en 未設定）: ${enNullEvents.cnt} 件`)
  console.log(`イベント（name_en = name で日本語）: ${enSameEvents.cnt} 件`)

  // 3. 全体の状態サマリー
  const { rows: [total] } = await client.query(
    `SELECT
       (SELECT COUNT(*)::int FROM ${SCHEMA}.events) as events,
       (SELECT COUNT(*)::int FROM ${SCHEMA}.categories) as categories,
       (SELECT COUNT(*)::int FROM ${SCHEMA}.events WHERE collected_at IS NOT NULL) as events_done,
       (SELECT COUNT(*)::int FROM ${SCHEMA}.categories WHERE collected_at IS NOT NULL) as cats_done,
       (SELECT COUNT(*)::int FROM ${SCHEMA}.categories WHERE collected_at IS NULL AND attempt_count < 3) as cats_pending,
       (SELECT COUNT(*)::int FROM ${SCHEMA}.categories WHERE attempt_count >= 3) as cats_maxed`
  )
  console.log(`\n=== 状態サマリー ===`)
  console.log(`イベント: ${total.events_done}/${total.events} enrich済み`)
  console.log(`カテゴリ: ${total.cats_done}/${total.categories} enrich済み`)
  console.log(`カテゴリ（処理待ち）: ${total.cats_pending}`)
  console.log(`カテゴリ（上限到達）: ${total.cats_maxed}`)

  await client.end()
}

run().catch((e) => { console.error(e); process.exit(1) })
