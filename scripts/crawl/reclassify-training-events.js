/**
 * 試走会・練習会・クリニック等を race_type:'training' または 'workshop' に再分類
 * 既存データから名前や説明に基づいて非レースイベントを特定し、race_type を更新
 *
 * 使い方:
 *   node scripts/crawl/reclassify-training-events.js              # 実行
 *   node scripts/crawl/reclassify-training-events.js --dry-run    # 確認のみ（UPDATE なし）
 *   node scripts/crawl/reclassify-training-events.js --limit 10   # 最初の10件のみ
 */
import pg from 'pg'
import Anthropic from '@anthropic-ai/sdk'
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
const limitIdx = args.indexOf('--limit')
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity

const SCHEMA = process.env.SUPABASE_SCHEMA ?? 'yabai_travel'

// ローカルで training/workshop を判定するキーワード（LLM前の高速フィルタ）
const TRAINING_KEYWORDS = /試走|練習会|走力養成|実践講座|トレーニング|ラン講座|走り方教室/i
const WORKSHOP_KEYWORDS = /クリニック|セミナー|講習会|ワークショップ|講座|スクール|教室/i

// training/workshop かどうかを簡易判定
function isTrainingOrWorkshop(name) {
  if (!name) return null
  if (TRAINING_KEYWORDS.test(name)) return 'training'
  if (WORKSHOP_KEYWORDS.test(name)) return 'workshop'
  return null
}

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  await client.connect()

  console.log(`=== 試走会・練習会・クリニック再分類開始 (DRY_RUN: ${DRY_RUN}) ===\n`)

  // race_type が 'other' またはレース系の場合、name が training/workshop キーワードを含む件を取得
  const { rows: targets } = await client.query(`
    SELECT id, name, description FROM ${SCHEMA}.events
    WHERE name IS NOT NULL
      AND (
        race_type = 'other'
        OR race_type IN ('marathon', 'trail', 'triathlon', 'bike', 'duathlon', 'rogaining', 'spartan', 'hyrox', 'tough_mudder', 'obstacle', 'adventure', 'devils_circuit', 'strong_viking')
      )
    ORDER BY updated_at DESC
    LIMIT ${LIMIT}
  `)

  console.log(`対象: ${targets.length} 件\n`)

  let reclassifyCount = 0
  let skipCount = 0

  for (let i = 0; i < targets.length; i++) {
    const { id, name, description } = targets[i]

    // 1. ローカルキーワード判定
    let raceType = isTrainingOrWorkshop(name)
    if (!raceType) {
      // 説明文でも確認
      raceType = isTrainingOrWorkshop(description)
    }

    if (!raceType) {
      skipCount++
      continue
    }

    // 2. LLMで最終確認（オプション: キーワード一致時は確認スキップ可）
    // ここでは一致したら即座に更新する（高速化）

    if (!DRY_RUN) {
      await client.query(
        `UPDATE ${SCHEMA}.events SET race_type = $1, updated_at = NOW() WHERE id = $2`,
        [raceType, id]
      )
    }

    console.log(`  [${i + 1}/${targets.length}] RECLASSIFY → ${raceType}: ${name?.slice(0, 50)}`)
    reclassifyCount++
  }

  console.log(`\n完了:`)
  console.log(`  - 再分類: ${reclassifyCount} 件`)
  console.log(`  - スキップ（キーワード未検出）: ${skipCount} 件`)
  if (DRY_RUN) {
    console.log(`  - DB 更新: なし（DRY_RUN）`)
  }

  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
