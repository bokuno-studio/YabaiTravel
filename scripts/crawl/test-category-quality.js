/**
 * #382 カテゴリ品質テストスクリプト
 * カテゴリ情報の品質を自動検証する
 *
 * 使い方:
 *   node scripts/crawl/test-category-quality.js                  # デフォルト100件
 *   node scripts/crawl/test-category-quality.js --limit 500      # 500件
 *   node scripts/crawl/test-category-quality.js --event-id <uuid>  # 特定イベント
 */
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import pg from 'pg'

const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  })
}

const SCHEMA = process.env.SUPABASE_SCHEMA ?? 'yabai_travel'
const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

const args = process.argv.slice(2)
const limitIdx = args.indexOf('--limit')
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 100
const eventIdIdx = args.indexOf('--event-id')
const EVENT_ID = eventIdIdx >= 0 ? args[eventIdIdx + 1] : null

// Fetch categories with event info
let query = `
  SELECT c.id, c.name, c.distance_km, c.entry_fee, c.entry_fee_currency,
    c.time_limit, c.start_time, c.mandatory_gear, c.poles_allowed,
    c.reception_place, c.start_place, c.collected_at,
    e.id as event_id, e.name as event_name, e.country_en, e.race_type
  FROM ${SCHEMA}.categories c
  JOIN ${SCHEMA}.events e ON c.event_id = e.id
  WHERE e.collected_at IS NOT NULL
`
const params = []
if (EVENT_ID) {
  query += ` AND e.id = $1`
  params.push(EVENT_ID)
} else {
  query += ` ORDER BY c.updated_at DESC LIMIT $1`
  params.push(LIMIT)
}

const { rows: categories } = await client.query(query, params)

// Issue counters
const issues = {}
function addIssue(type, catId, detail) {
  if (!issues[type]) issues[type] = []
  issues[type].push({ catId, detail })
}

const COUNTRY_TO_CURRENCY = {
  'Japan': 'JPY', 'United States': 'USD', 'USA': 'USD', 'UK': 'GBP',
  'Australia': 'AUD', 'New Zealand': 'NZD', 'Canada': 'CAD',
  'Thailand': 'THB', 'Philippines': 'PHP', 'Singapore': 'SGD',
  'France': 'EUR', 'Germany': 'EUR', 'Italy': 'EUR', 'Spain': 'EUR',
}

for (const cat of categories) {
  const label = `${cat.event_name?.slice(0, 25)} / ${cat.name}`

  // 1. distance_km が NULL
  if (cat.distance_km == null) {
    addIssue('CAT_NO_DISTANCE', cat.id, label)
  }

  // 2. entry_fee が NULL
  if (cat.entry_fee == null && cat.collected_at) {
    addIssue('CAT_NO_ENTRY_FEE', cat.id, label)
  }

  // 3. entry_fee_currency が不正
  if (cat.entry_fee != null && cat.country_en) {
    const expected = COUNTRY_TO_CURRENCY[cat.country_en]
    if (expected && cat.entry_fee_currency && cat.entry_fee_currency !== expected) {
      addIssue('CAT_WRONG_CURRENCY', cat.id, `${label} | ${cat.entry_fee_currency} should be ${expected}`)
    }
  }

  // 4. entry_fee_currency が NULL
  if (cat.entry_fee != null && !cat.entry_fee_currency) {
    addIssue('CAT_NO_CURRENCY', cat.id, label)
  }

  // 5. time_limit が NULL（trail/marathon で重要）
  if (cat.time_limit == null && ['trail', 'marathon'].includes(cat.race_type)) {
    addIssue('CAT_NO_TIME_LIMIT', cat.id, label)
  }

  // 6. reception_place / start_place が NULL
  if (!cat.reception_place && !cat.start_place) {
    addIssue('CAT_NO_VENUE', cat.id, label)
  }

  // 7. カテゴリ名に正規化可能な表記揺れ
  if (cat.name && /\s+(miles?|meters?|metres?|kilometers?|kilometres?)\b/i.test(cat.name)) {
    addIssue('CAT_NAME_UNNORMALIZED', cat.id, `${label} | "${cat.name}"`)
  }

  // 8. entry_fee が異常値（0 or 負）
  if (cat.entry_fee != null && cat.entry_fee <= 0) {
    addIssue('CAT_FEE_ZERO', cat.id, `${label} | fee=${cat.entry_fee}`)
  }

  // 9. collected_at が NULL（未処理）
  if (!cat.collected_at) {
    addIssue('CAT_NOT_COLLECTED', cat.id, label)
  }
}

// Report
console.log(`\n=== カテゴリ品質レポート ===`)
console.log(`対象: ${categories.length} カテゴリ\n`)

let totalIssues = 0
for (const [type, items] of Object.entries(issues).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`[${type}] ${items.length}件`)
  for (const item of items.slice(0, 5)) {
    console.log(`  - ${item.detail}`)
  }
  if (items.length > 5) console.log(`  ... 他${items.length - 5}件`)
  totalIssues += items.length
}

console.log(`\n合計: ${totalIssues} issues / ${categories.length} categories`)
console.log(`品質スコア: ${((1 - totalIssues / (categories.length * 9)) * 100).toFixed(1)}%`)

await client.end()
process.exit(totalIssues > 0 ? 1 : 0)
