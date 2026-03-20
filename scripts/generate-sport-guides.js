/**
 * スポーツガイドコンテンツ生成スクリプト
 * Anthropic API (Claude Haiku) でガイドコンテンツを生成し、
 * Supabase Management API 経由で sport_guides テーブルに upsert する
 *
 * 使い方:
 *   node scripts/generate-sport-guides.js
 */
import Anthropic from '@anthropic-ai/sdk'
import { queryManagementAPI } from './supabase-api.js'

// --- env ---
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

for (const envFile of ['.env.local', '.env']) {
  const envPath = resolve(process.cwd(), envFile)
  if (existsSync(envPath)) {
    readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
      const m = line.match(/^([^#=]+)=(.*)$/)
      if (m && !process.env[m[1].trim()]) {
        process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
      }
    })
    break
  }
}

const SCHEMA = process.env.VITE_SUPABASE_SCHEMA ?? 'yabai_travel'

const SPORT_KEYS = [
  'marathon', 'trail', 'triathlon', 'spartan', 'hyrox',
  'obstacle', 'cycling', 'duathlon', 'rogaining', 'adventure',
]

const SPORT_NAMES_JA = {
  marathon: 'マラソン',
  trail: 'トレイルランニング',
  triathlon: 'トライアスロン',
  spartan: 'スパルタンレース',
  hyrox: 'HYROX',
  obstacle: 'オブスタクルレース（OCR）',
  cycling: 'サイクリング（エンデュランス系）',
  duathlon: 'デュアスロン',
  rogaining: 'ロゲイニング',
  adventure: 'アドベンチャーレース',
}

const SPORT_NAMES_EN = {
  marathon: 'Marathon',
  trail: 'Trail Running',
  triathlon: 'Triathlon',
  spartan: 'Spartan Race',
  hyrox: 'HYROX',
  obstacle: 'Obstacle Course Racing (OCR)',
  cycling: 'Endurance Cycling',
  duathlon: 'Duathlon',
  rogaining: 'Rogaining',
  adventure: 'Adventure Racing',
}

const PROMPT_JA = (sportName) => `あなたはエンデュランススポーツの専門家です。「${sportName}」について以下の JSON 構造で詳細なガイドコンテンツを日本語で生成してください。

出力は **JSON のみ** 返してください。マークダウンのコードブロックや説明文は不要です。

{
  "overview": "スポーツの概要・歴史・魅力（200-300字）",
  "rules": "ルール・形式の説明（200-300字）",
  "getting_started": "始め方・必要なもの（300-400字）",
  "recommended_races": "おすすめの入門大会（日本国内と海外の有名大会を含めて3-5件、大会名と簡単な説明を含む）",
  "common_mistakes": "よくある失敗と対策（3-5項目、各項目は「失敗」と「対策」を含む）",
  "gear": {
    "essential": ["必須アイテム（5-8個）"],
    "recommended": ["推奨アイテム（3-5個）"],
    "budget": "初期費用の目安（円建て）"
  },
  "community": "コミュニティ情報（SNSハッシュタグ、練習会情報、主要なコミュニティサイト等）"
}

recommended_races は文字列（テキスト）で、大会名と説明を含む自然な文章にしてください。
common_mistakes も文字列（テキスト）で、箇条書き風の自然な文章にしてください。`

const PROMPT_EN = (sportName) => `You are an endurance sports expert. Generate a detailed guide for "${sportName}" in the following JSON structure. Write in English.

Return **JSON only**. No markdown code blocks or explanations.

{
  "overview": "Sport overview, history, and appeal (150-250 words)",
  "rules": "Rules and format explanation (150-250 words)",
  "getting_started": "How to get started, what you need (200-300 words)",
  "recommended_races": "Recommended beginner-friendly races (3-5 events including international ones, with names and brief descriptions)",
  "common_mistakes": "Common mistakes and how to avoid them (3-5 items, each with the mistake and solution)",
  "gear": {
    "essential": ["Essential items (5-8)"],
    "recommended": ["Recommended items (3-5)"],
    "budget": "Estimated initial budget (in USD)"
  },
  "community": "Community info (social media hashtags, training groups, key community sites)"
}

recommended_races should be a string with race names and descriptions in natural text.
common_mistakes should also be a string with items in natural text.`

async function generateContent(client, sportKey, lang, maxRetries = 3) {
  const isJa = lang === 'ja'
  const sportName = isJa ? SPORT_NAMES_JA[sportKey] : SPORT_NAMES_EN[sportKey]
  const prompt = isJa ? PROMPT_JA(sportName) : PROMPT_EN(sportName)

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      })

      const text = response.content[0].text.trim()
      // Extract JSON from possible markdown code blocks
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text]
      const json = JSON.parse(jsonMatch[1].trim())
      return json
    } catch (err) {
      console.warn(`  [${sportKey}/${lang}] attempt ${attempt}/${maxRetries} failed: ${err.message.slice(0, 80)}`)
      if (attempt < maxRetries) {
        const delay = attempt * 5000 // 5s, 10s, 15s
        await new Promise((r) => setTimeout(r, delay))
      } else {
        throw err
      }
    }
  }
}

function escapeSql(str) {
  return str.replace(/'/g, "''")
}

async function upsertGuide(sportKey, contentJa, contentEn) {
  const jaJson = escapeSql(JSON.stringify(contentJa))
  const enJson = escapeSql(JSON.stringify(contentEn))

  const sql = `
    INSERT INTO ${SCHEMA}.sport_guides (sport_key, content_ja, content_en, updated_at)
    VALUES ('${sportKey}', '${jaJson}'::jsonb, '${enJson}'::jsonb, NOW())
    ON CONFLICT (sport_key)
    DO UPDATE SET
      content_ja = EXCLUDED.content_ja,
      content_en = EXCLUDED.content_en,
      updated_at = NOW();
  `
  await queryManagementAPI(sql)
}

async function main() {
  const client = new Anthropic()

  console.log(`=== スポーツガイドコンテンツ生成 (${SPORT_KEYS.length} スポーツ) ===\n`)

  for (const sportKey of SPORT_KEYS) {
    console.log(`[${sportKey}] 生成中...`)

    try {
      // Generate JA and EN in parallel
      const [contentJa, contentEn] = await Promise.all([
        generateContent(client, sportKey, 'ja'),
        generateContent(client, sportKey, 'en'),
      ])

      console.log(`[${sportKey}] JA/EN 生成完了。DB に upsert 中...`)
      await upsertGuide(sportKey, contentJa, contentEn)
      console.log(`[${sportKey}] 完了 ✓\n`)
    } catch (err) {
      console.error(`[${sportKey}] エラー:`, err.message)
      // Continue with other sports
    }
  }

  console.log('=== 全スポーツの生成完了 ===')
}

main().catch((err) => {
  console.error('致命的エラー:', err)
  process.exit(1)
})
