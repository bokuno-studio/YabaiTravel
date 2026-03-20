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

const SYSTEM_PROMPT_JA = `あなたはエンデュランス系スポーツの専門ライターです。
完全な初心者に向けて、わかりやすく、具体的で、すぐに行動に移せる情報を提供してください。
専門用語は必ず説明を添えてください。
各セクションは指定された文字数を目安に、十分な情報量で記載してください。
出力は JSON のみ返してください。マークダウンのコードブロックや説明文は不要です。`

const SYSTEM_PROMPT_EN = `You are an expert endurance sports writer.
Write for complete beginners — be clear, specific, and actionable.
Always explain technical terms.
Each section should meet the specified word count with substantial, useful information.
Return JSON only. No markdown code blocks or explanations.`

const PROMPT_JA = (sportName) => `「${sportName}」について以下の JSON 構造で詳細なガイドコンテンツを日本語で生成してください。
各セクションの文字数目安を必ず守り、具体的なエピソードや数字を盛り込んでください。

{
  "overview": "500-600字: このスポーツの概要を詳しく説明してください。歴史的な背景（いつ頃始まり、どのように発展したか）、競技の基本的な特徴、なぜ近年人気が高まっているのか、どんな人に向いているか（体力レベル・性格・ライフスタイル）、参加者の年齢層や男女比、完走した時の達成感について具体的に記述してください。",
  "rules": "400-500字: 競技の基本ルールを詳しく説明してください。レースフォーマット（個人/チーム）、距離カテゴリ（初心者向け〜上級者向け）とそれぞれの目安タイム、制限時間の考え方、失格になるケース、エイドステーション（補給所）のルール、ペナルティの種類、スタート方式（ウェーブスタート等）について記述してください。",
  "getting_started": "500-600字: 完全初心者が始めるまでのステップバイステップガイドを記述してください。Step1: 情報収集（どこで情報を得るか）、Step2: 体力づくり（何ヶ月前から何をすべきか）、Step3: 装備準備（最低限必要なもの）、Step4: 練習計画（週何回・どんな練習か）、Step5: 大会エントリー（エントリー時期・方法）、Step6: 大会当日の流れ。各ステップに具体的な期間や数値を含めてください。",
  "recommended_races": "300-400字: 初心者におすすめの大会を6-8件紹介してください。各大会について、大会名、開催地、特徴（コースの難易度、サポート体制、雰囲気）、初心者おすすめ度を含めてください。日本国内5-6件、海外1-2件のバランスで。",
  "common_mistakes": "400-500字: 初心者がやりがちな失敗を6-8個挙げてください。各失敗について、具体的なシチュエーション（例:「大会1週間前に新しいシューズを買って本番で靴擦れ」）、なぜそれが問題なのか、具体的な対策を記述してください。",
  "gear": {
    "essential": ["必須アイテム6-8個。各アイテムについて「アイテム名: 選び方のポイント、おすすめの価格帯、初心者が間違えやすい点」の形式で詳しく記述"],
    "recommended": ["推奨アイテム4-6個。同様の形式で記述"],
    "budget": "初期投資の具体的な金額範囲を、最低限コース・標準コース・充実コースの3パターンで提示（例: 最低限3万円〜充実10万円）"
  },
  "community": "200-300字: 具体的なSNSハッシュタグ（5個以上）、主要なコミュニティサイトやアプリ（名前とURL）、練習会の見つけ方（どのプラットフォームで探すか）、初心者が仲間を見つけるためのアドバイスを記述してください。"
}

recommended_races は文字列（テキスト）で、大会名と説明を含む自然な文章にしてください。
common_mistakes も文字列（テキスト）で、各失敗と対策をまとめた自然な文章にしてください。
gear.essential と gear.recommended の各要素は詳しい説明を含む文字列にしてください。`

const PROMPT_EN = (sportName) => `Generate a detailed guide for "${sportName}" in the following JSON structure. Write in English.
Each section must meet the specified word count with specific examples and numbers.

{
  "overview": "350-450 words: Explain this sport in detail. Cover its historical background (when it started, how it evolved), basic characteristics, why it has grown in popularity recently, what kind of person it suits (fitness level, personality, lifestyle), typical age range and demographics of participants, and the sense of achievement from completing an event.",
  "rules": "300-350 words: Explain the competition rules in detail. Cover race format (individual/team), distance categories (beginner to advanced) with target times for each, time limits, disqualification scenarios, aid station rules, penalty types, and start formats (wave starts, etc.).",
  "getting_started": "350-450 words: Provide a step-by-step guide for complete beginners. Step 1: Research (where to find info), Step 2: Building fitness (how many months before, what to do), Step 3: Gear preparation (minimum essentials), Step 4: Training plan (sessions per week, types of training), Step 5: Race entry (when and how to register), Step 6: Race day logistics. Include specific timeframes and numbers for each step.",
  "recommended_races": "250-300 words: Recommend 6-8 beginner-friendly races. For each, include the race name, location, key features (course difficulty, support level, atmosphere), and a beginner-friendliness rating. Include 3-4 US/international races and 3-4 from other countries.",
  "common_mistakes": "300-350 words: List 6-8 common beginner mistakes. For each, describe a specific scenario (e.g., 'Buying new shoes the week before race day and getting blisters'), explain why it's a problem, and give a concrete solution.",
  "gear": {
    "essential": ["6-8 essential items. For each: 'Item name: selection tips, recommended price range, common beginner mistakes' in detailed format"],
    "recommended": ["4-6 recommended items in the same format"],
    "budget": "Specific budget ranges in three tiers: minimum, standard, and premium (e.g., minimum $200 to premium $800)"
  },
  "community": "150-200 words: List specific social media hashtags (5+), major community sites and apps (with names), how to find training groups, and advice for beginners looking to connect with others."
}

recommended_races should be a string with race names and descriptions in natural text.
common_mistakes should also be a string in natural text format.
Each element in gear.essential and gear.recommended should be a detailed string.`

async function generateContent(client, sportKey, lang, maxRetries = 3) {
  const isJa = lang === 'ja'
  const sportName = isJa ? SPORT_NAMES_JA[sportKey] : SPORT_NAMES_EN[sportKey]
  const systemPrompt = isJa ? SYSTEM_PROMPT_JA : SYSTEM_PROMPT_EN
  const prompt = isJa ? PROMPT_JA(sportName) : PROMPT_EN(sportName)

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      })

      let text = response.content[0].text.trim()
      // Strip markdown code blocks if present
      if (text.startsWith('```')) {
        text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
      }
      const json = JSON.parse(text)

      // Validate key fields exist
      const requiredKeys = ['overview', 'rules', 'getting_started', 'recommended_races', 'common_mistakes', 'gear', 'community']
      for (const key of requiredKeys) {
        if (!json[key]) throw new Error(`Missing required key: ${key}`)
      }

      // Log content length for verification
      const totalChars = JSON.stringify(json).length
      console.log(`  [${sportKey}/${lang}] content length: ${totalChars} chars`)

      return json
    } catch (err) {
      console.warn(`  [${sportKey}/${lang}] attempt ${attempt}/${maxRetries} failed: ${err.message.slice(0, 120)}`)
      if (attempt < maxRetries) {
        const delay = attempt * 5000
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

  console.log(`=== スポーツガイドコンテンツ生成 (${SPORT_KEYS.length} スポーツ) ===`)
  console.log(`Model: claude-haiku-4-5-20251001 | max_tokens: 8192\n`)

  for (const sportKey of SPORT_KEYS) {
    console.log(`[${sportKey}] 生成中...`)

    try {
      // Generate JA first, then EN (sequential to avoid rate limits)
      const contentJa = await generateContent(client, sportKey, 'ja')
      const contentEn = await generateContent(client, sportKey, 'en')

      console.log(`[${sportKey}] JA/EN 生成完了。DB に upsert 中...`)
      await upsertGuide(sportKey, contentJa, contentEn)
      console.log(`[${sportKey}] 完了\n`)
    } catch (err) {
      console.error(`[${sportKey}] エラー:`, err.message)
      // Continue with other sports
    }

    // Small delay between sports to avoid rate limiting
    await new Promise((r) => setTimeout(r, 1000))
  }

  console.log('=== 全スポーツの生成完了 ===')

  // Verify data
  console.log('\n--- 検証: DB に保存されたデータの文字数 ---')
  const verifyResult = await queryManagementAPI(`
    SELECT sport_key,
           length(content_ja::text) as ja_chars,
           length(content_en::text) as en_chars
    FROM ${SCHEMA}.sport_guides
    ORDER BY sport_key;
  `)
  console.table(verifyResult)
}

main().catch((err) => {
  console.error('致命的エラー:', err)
  process.exit(1)
})
