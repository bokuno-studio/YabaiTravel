/**
 * 確認cron（1時間おき）: Batch API の処理状況ポーリング + DB更新
 *
 * 処理フロー:
 * 1. batch_jobs から status='pending' を取得
 * 2. 各 batch_id について:
 *    - waitForBatch() で完了確認（polling）
 *    - 完了: getBatchResults() で結果取得 → events テーブル更新 → batch_jobs.status='completed'
 *    - expired: batch_jobs.status='expired'
 *    - failed: batch_jobs.status='failed'
 * 3. 終了
 *
 * 使い方:
 *   node scripts/crawl/check-batch.js
 *   node scripts/crawl/check-batch.js --dry-run
 */

import pg from 'pg'
import Anthropic from '@anthropic-ai/sdk'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { waitForBatch, getBatchResults } from './lib/batch-utils.js'

const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  })
}

const SCHEMA = process.env.SUPABASE_SCHEMA ?? 'yabai_travel'
const DRY_RUN = process.argv.includes('--dry-run')
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

console.log(`🔍 check-batch.js: pending Batch を確認 (dry-run: ${DRY_RUN})`)

async function checkBatch() {
  try {
    // 1. pending batch を全件取得
    const { rows: pendingBatches } = await pool.query(
      `SELECT id, batch_id FROM "${SCHEMA}".batch_jobs
       WHERE status = 'pending'
       ORDER BY created_at ASC`
    )

    console.log(`\n📊 対象件数: ${pendingBatches.length} batch`)

    if (pendingBatches.length === 0) {
      console.log('✅ 処理対象なし')
      return
    }

    // 2. 各 batch_id をポーリング
    for (let i = 0; i < pendingBatches.length; i++) {
      const { id: batchJobId, batch_id: batchId } = pendingBatches[i]

      console.log(`\n[${i + 1}/${pendingBatches.length}] batch_id: ${batchId}`)

      try {
        // waitForBatch: 最大24時間ポーリング（30秒タイムアウト/回）
        const batch = await waitForBatch(
          anthropic,
          batchId,
          30000, // 30秒ポーリング間隔
          24 * 60 * 60 * 1000 // 24時間タイムアウト
        )

        if (batch.processing_status === 'ended') {
          console.log(`  ✅ 処理完了`)

          // getBatchResults: custom_id → 結果マッピング
          const results = await getBatchResults(anthropic, batchId)
          console.log(`  📈 結果: ${results.size}件取得`)

          let succeededCount = 0
          let failedCount = 0
          const errors = []

          // 3. 各結果を event_id ごとに処理
          for (const [customId, result] of results) {
            const eventId = customId.startsWith('event_') ? customId.slice(6) : customId

            if (result.success && result.parsed) {
              succeededCount++
              const extracted = result.parsed

              // events テーブルを UPDATE
              if (!DRY_RUN) {
                await pool.query(
                  `UPDATE "${SCHEMA}".events SET
                     name = COALESCE(name, $2),
                     location = COALESCE(location, $3),
                     event_date = COALESCE(event_date, $4),
                     race_type = COALESCE(race_type, $5),
                     collected_at = NOW(),
                     attempt_count = 0
                   WHERE id = $1`,
                  [
                    eventId,
                    extracted.event?.name || null,
                    extracted.event?.location || null,
                    extracted.event?.event_date || null,
                    extracted.event?.race_type || null,
                  ]
                )
              }
            } else {
              failedCount++
              const errorMsg = result.error || 'Unknown error'
              errors.push({ event_id: eventId, error: errorMsg })
            }
          }

          // batch_jobs を UPDATE: status='completed'
          const resultSummary = {
            total: results.size,
            succeeded: succeededCount,
            failed: failedCount,
            errors: errors.slice(0, 10),
          }

          if (!DRY_RUN) {
            await pool.query(
              `UPDATE "${SCHEMA}".batch_jobs SET
                 status = 'completed',
                 result_summary = $2,
                 completed_at = NOW()
               WHERE batch_id = $1`,
              [batchId, resultSummary]
            )
          }

          console.log(`  💾 DB更新: ${succeededCount}件成功, ${failedCount}件失敗`)
          console.log(`  ✅ batch_jobs.status = 'completed'`)
        } else if (batch.processing_status === 'expired') {
          console.log(`  ⏱️ 期限切れ`)
          if (!DRY_RUN) {
            await pool.query(
              `UPDATE "${SCHEMA}".batch_jobs SET status = 'expired' WHERE batch_id = $1`,
              [batchId]
            )
          }
        } else {
          console.log(`  ❌ 不明なステータス: ${batch.processing_status}`)
          if (!DRY_RUN) {
            await pool.query(
              `UPDATE "${SCHEMA}".batch_jobs SET status = 'failed' WHERE batch_id = $1`,
              [batchId]
            )
          }
        }
      } catch (e) {
        console.log(`  ❌ エラー: ${e.message}`)
        if (!DRY_RUN) {
          await pool.query(
            `UPDATE "${SCHEMA}".batch_jobs SET status = 'failed' WHERE batch_id = $1`,
            [batchId]
          )
        }
      }
    }

    console.log(`\n✅ 完了`)
  } catch (e) {
    console.error('❌ Fatal error:', e)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

checkBatch()
