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
  'obstacle', 'bike', 'duathlon', 'rogaining', 'adventure',
]

const SPORT_NAMES_JA = {
  marathon: 'マラソン',
  trail: 'トレイルランニング',
  triathlon: 'トライアスロン',
  spartan: 'スパルタンレース',
  hyrox: 'HYROX',
  obstacle: 'オブスタクルレース（OCR）',
  bike: 'バイク（エンデュランス系）',
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
  bike: 'Endurance Cycling',
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
  "overview": {
    "summary": "500-600字: このスポーツの概要を詳しく説明してください。歴史的な背景、競技の基本的な特徴、なぜ近年人気が高まっているのか、どんな人に向いているか、参加者の年齢層や男女比、完走した時の達成感について具体的に記述してください。",
    "highlights": ["このスポーツの魅力を5-7個の短いフレーズで（各20-40字）"]
  },
  "rules": {
    "items": [
      {"label": "項目名（例: レース形式）", "value": "内容を詳しく記述"},
      {"label": "距離カテゴリ", "value": "初心者向け〜上級者向けの距離と目安タイム"},
      {"label": "制限時間", "value": "制限時間の考え方"},
      {"label": "失格条件", "value": "失格になるケース"},
      {"label": "エイドステーション", "value": "補給所のルール"},
      {"label": "スタート方式", "value": "ウェーブスタート等の説明"}
    ],
    "notes": "100-150字: ルールに関する補足事項・初心者へのアドバイス"
  },
  "getting_started": {
    "steps": [
      {"title": "Step 1: 情報収集", "description": "100字: どこで情報を得るか"},
      {"title": "Step 2: 体力づくり", "description": "100字: 何ヶ月前から何をすべきか"},
      {"title": "Step 3: 装備準備", "description": "100字: 最低限必要なもの"},
      {"title": "Step 4: 練習計画", "description": "100字: 週何回・どんな練習か"},
      {"title": "Step 5: 大会エントリー", "description": "100字: エントリー時期・方法"},
      {"title": "Step 6: 大会当日の流れ", "description": "100字: 当日の注意点"}
    ]
  },
  "recommended_races": [
    {
      "name": "大会名",
      "location": "開催地（例: 東京都）",
      "difficulty": "難易度（初心者向け/中級者向け/上級者向け）",
      "description": "60-80字: コースの特徴、サポート体制、雰囲気"
    }
  ],
  "common_mistakes": [
    {
      "mistake": "失敗のタイトル（例: 新しいシューズでレースに出る）",
      "solution": "80-100字: なぜ問題か、具体的な対策"
    }
  ],
  "gear": {
    "essential": ["必須アイテム6-8個。各アイテムについて「アイテム名: 選び方のポイント、おすすめの価格帯、初心者が間違えやすい点」の形式で詳しく記述"],
    "recommended": ["推奨アイテム4-6個。同様の形式で記述"],
    "budget": "初期投資の具体的な金額範囲を、最低限コース・標準コース・充実コースの3パターンで提示（例: 最低限3万円〜充実10万円）"
  },
  "community": "200-300字: 具体的なSNSハッシュタグ（5個以上）、主要なコミュニティサイトやアプリ（名前とURL）、練習会の見つけ方、初心者が仲間を見つけるためのアドバイスを記述してください。"
}

recommended_races は6-8件（日本国内5-6件、海外1-2件）のオブジェクト配列で返してください。
common_mistakes は6-8件のオブジェクト配列で返してください。
gear.essential と gear.recommended の各要素は詳しい説明を含む文字列にしてください。`

const PROMPT_EN = (sportName) => `Generate a detailed guide for "${sportName}" in the following JSON structure. Write in English.
Each section must meet the specified word count with specific examples and numbers.

{
  "overview": {
    "summary": "350-450 words: Explain this sport in detail. Cover its historical background, basic characteristics, why it has grown in popularity, what kind of person it suits, typical demographics, and the sense of achievement from completing an event.",
    "highlights": ["5-7 short phrases highlighting the sport's appeal (each 5-15 words)"]
  },
  "rules": {
    "items": [
      {"label": "Race Format", "value": "Detailed description of individual/team format"},
      {"label": "Distance Categories", "value": "Beginner to advanced with target times"},
      {"label": "Time Limits", "value": "How cutoffs work"},
      {"label": "Disqualification", "value": "Common DQ scenarios"},
      {"label": "Aid Stations", "value": "Rules about aid stations"},
      {"label": "Start Format", "value": "Wave starts, mass starts, etc."}
    ],
    "notes": "50-80 words: Additional notes and beginner advice about rules"
  },
  "getting_started": {
    "steps": [
      {"title": "Step 1: Research", "description": "50-70 words: Where to find information"},
      {"title": "Step 2: Build Fitness", "description": "50-70 words: Timeline and training approach"},
      {"title": "Step 3: Gear Up", "description": "50-70 words: Minimum essentials"},
      {"title": "Step 4: Training Plan", "description": "50-70 words: Weekly schedule and types"},
      {"title": "Step 5: Race Entry", "description": "50-70 words: When and how to register"},
      {"title": "Step 6: Race Day", "description": "50-70 words: Day-of logistics"}
    ]
  },
  "recommended_races": [
    {
      "name": "Race Name",
      "location": "City, Country",
      "difficulty": "Beginner-friendly / Intermediate / Advanced",
      "description": "30-50 words: Course features, support level, atmosphere"
    }
  ],
  "common_mistakes": [
    {
      "mistake": "Mistake title (e.g., Racing in new shoes)",
      "solution": "40-60 words: Why it's a problem and the concrete fix"
    }
  ],
  "gear": {
    "essential": ["6-8 essential items. For each: 'Item name: selection tips, recommended price range, common beginner mistakes' in detailed format"],
    "recommended": ["4-6 recommended items in the same format"],
    "budget": "Specific budget ranges in three tiers: minimum, standard, and premium (e.g., minimum $200 to premium $800)"
  },
  "community": "150-200 words: List specific social media hashtags (5+), major community sites and apps (with names), how to find training groups, and advice for beginners looking to connect with others."
}

recommended_races should be an array of 6-8 objects (3-4 US/international, 3-4 from other countries).
common_mistakes should be an array of 6-8 objects.
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

      // Validate structured format
      if (typeof json.overview === 'string') throw new Error('overview must be an object with summary and highlights')
      if (typeof json.rules === 'string') throw new Error('rules must be an object with items and notes')
      if (typeof json.getting_started === 'string') throw new Error('getting_started must be an object with steps')
      if (!Array.isArray(json.recommended_races)) throw new Error('recommended_races must be an array of objects')
      if (!Array.isArray(json.common_mistakes)) throw new Error('common_mistakes must be an array of objects')

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
