/**
 * race_type = 'other' のイベントを一括再分類するスクリプト
 * イベント名ベースで LLM に再分類させる
 * DB接続は Management API 経由（DATABASE_URL 不要）
 *
 * 使い方:
 *   node scripts/crawl/reclassify-other.js              # 実行
 *   node scripts/crawl/reclassify-other.js --dry-run    # DB更新なし
 */
import Anthropic from '@anthropic-ai/sdk'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { queryManagementAPI } from '../supabase-api.js'

const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  })
}

const SCHEMA = process.env.SUPABASE_SCHEMA ?? 'yabai_travel'
const DRY_RUN = process.argv.includes('--dry-run')

const VALID_RACE_TYPES = [
  'marathon', 'trail', 'triathlon', 'cycling', 'duathlon', 'rogaining',
  'spartan', 'hyrox', 'obstacle', 'adventure', 'devils_circuit', 'strong_viking',
]

const CLASSIFY_PROMPT = `あなたはレースイベントの分類エキスパートです。
イベント名から race_type を判定してください。

分類基準:
- marathon: ロードレース、マラソン、ハーフマラソン、リレーマラソン、ファンラン、ウルトラマラソン、ウルトラマラニック等の舗装路ランニング大会
- trail: トレイルランニング、山岳レース、ウルトラトレイル等の未舗装路ランニング大会
- triathlon: トライアスロン（スイム+バイク+ラン）、アクアスロン
- cycling: 自転車レース、クリテリウム、ヒルクライム、ロングライド、グラベル、エンデューロ（自転車）、サイクルフェスタ、ツール・ド
- duathlon: デュアスロン（ラン+バイク+ラン）
- rogaining: ロゲイニング、フォトロゲ
- spartan: スパルタンレース
- hyrox: HYROX
- obstacle: OCR・障害物レース（スパルタン・HYROX以外）、タフマダー
- adventure: アドベンチャーレース
- other: 上記に該当しない場合のみ

race_type の値のみを返してください（例: marathon）。説明は不要です。`

async function run() {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const rows = await queryManagementAPI(
    `SELECT id, name FROM ${SCHEMA}.events WHERE race_type = 'other' ORDER BY name`
  )

  console.log(`対象: ${rows.length} 件 (DRY_RUN: ${DRY_RUN})\n`)

  let reclassified = 0
  let unchanged = 0
  const results = {}

  for (let i = 0; i < rows.length; i++) {
    const { id, name } = rows[i]
    try {
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 32,
        system: CLASSIFY_PROMPT,
        messages: [{ role: 'user', content: name }],
      })
      const text = (msg.content[0].type === 'text' ? msg.content[0].text : '').trim().toLowerCase()

      if (VALID_RACE_TYPES.includes(text)) {
        results[text] = (results[text] || 0) + 1
        if (!DRY_RUN) {
          await queryManagementAPI(
            `UPDATE ${SCHEMA}.events SET race_type = '${text}' WHERE id = '${id}'`
          )
        }
        console.log(`  [${String(i + 1).padStart(3)}] ${text.padEnd(12)} ← ${name.slice(0, 60)}`)
        reclassified++
      } else {
        results.other = (results.other || 0) + 1
        console.log(`  [${String(i + 1).padStart(3)}] other        ← ${name.slice(0, 60)}`)
        unchanged++
      }

      // レートリミット対策: 10件ごとに1秒待機
      if ((i + 1) % 10 === 0) await new Promise((r) => setTimeout(r, 1000))
    } catch (e) {
      console.log(`  [${String(i + 1).padStart(3)}] ERROR        ← ${name.slice(0, 60)} | ${e.message?.slice(0, 50)}`)
      unchanged++
    }
  }

  console.log(`\n=== 結果 ===`)
  console.log(`再分類: ${reclassified} / 変更なし: ${unchanged}`)
  console.log(`\n内訳:`)
  for (const [type, count] of Object.entries(results).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type.padEnd(15)} ${count}`)
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
