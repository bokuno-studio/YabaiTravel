/**
 * DB の events を LLM（Claude Haiku）で詳細情報を補完
 * 各レースの official_url から詳細ページを取得し、
 * テーブル仕様に沿った構造化データを抽出して DB を更新
 *
 * 使い方:
 *   node scripts/crawl/enrich-events-with-llm.js          # 全件
 *   node scripts/crawl/enrich-events-with-llm.js --dry-run # DB更新せず結果のみ表示
 *   node scripts/crawl/enrich-events-with-llm.js --limit 3 # 最初の3件のみ
 */
import pg from 'pg'
import Anthropic from '@anthropic-ai/sdk'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import * as cheerio from 'cheerio'

const envPath = resolve(process.cwd(), '.env.local')
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

const SYSTEM_PROMPT = `あなたはレースイベントの情報抽出エキスパートです。
与えられた公式ページの内容から、以下の JSON 形式で情報を抽出してください。

{
  "event": {
    "name": "正式な大会名",
    "event_date": "YYYY-MM-DD（開催初日）",
    "location": "開催地（都市名, 国）",
    "country": "国名（日本語）",
    "race_type": "spartan|trail|hyrox|obstacle|adventure|marathon|other のいずれか",
    "entry_url": "申込URL（あれば）",
    "entry_start": "YYYY-MM-DD（申込開始日、記載あれば）",
    "entry_end": "YYYY-MM-DD（申込終了日、記載あれば）",
    "reception_place": "受付場所",
    "start_place": "スタート場所"
  },
  "categories": [
    {
      "name": "カテゴリ名（Sprint, Beast, 100K, Kids Race 等）",
      "distance_km": 数値,
      "elevation_gain": 数値（メートル）,
      "entry_fee": 数値（現地通貨で）,
      "entry_fee_currency": "JPY|USD|EUR 等",
      "start_time": "HH:MM（24h）",
      "time_limit": "HH:MM:SS 形式（制限時間）",
      "mandatory_gear": "必携品リスト",
      "obstacles_count": 数値（障害物数、あれば）
    }
  ]
}

ルール:
- ページに記載がない項目は null にする。推測しない
- 日付は必ず YYYY-MM-DD 形式に変換
- 金額は数値のみ（カンマなし）。通貨は別フィールド
- categories は記載されている全カテゴリを抽出
- JSON のみを返し、説明は不要`

async function fetchHtml(url) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'YabaiTravel-Crawl/1.0 (enrichment)' },
      redirect: 'follow',
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) throw new Error(`${res.status}`)
    return res.text()
  } catch (e) {
    clearTimeout(timeout)
    throw e
  }
}

/** HTML からレース情報に関連する部分だけを抽出してトークンを節約 */
function extractRelevantContent(html, maxChars = 8000) {
  const $ = cheerio.load(html)

  // 不要な要素を除去
  $('script, style, svg, nav, footer, header, iframe, noscript, meta, link').remove()
  $('[class*="cookie"], [class*="banner"], [class*="popup"], [class*="modal"]').remove()
  $('[class*="newsletter"], [class*="subscribe"]').remove()

  // テキストコンテンツを取得
  const text = $('body').text()
    .replace(/\s+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (text.length <= maxChars) return text
  return text.slice(0, maxChars) + '\n[...truncated]'
}

async function extractWithLlm(pageContent, raceName, anthropic) {
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `以下は「${raceName}」の公式ページの内容です。レース情報を抽出してください。\n\n${pageContent}`,
      },
    ],
  })

  const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('LLM が JSON を返しませんでした')

  const result = JSON.parse(jsonMatch[0])
  return {
    ...result,
    _usage: { input_tokens: msg.usage.input_tokens, output_tokens: msg.usage.output_tokens },
  }
}

/** DB の events の空フィールドだけを更新 */
async function updateEvent(client, eventId, data) {
  if (!data.event) return
  const e = data.event
  const updates = []
  const values = []
  let idx = 1

  const fields = {
    location: e.location,
    country: e.country,
    entry_url: e.entry_url,
    entry_start: e.entry_start,
    entry_end: e.entry_end,
    reception_place: e.reception_place,
    start_place: e.start_place,
  }

  for (const [field, value] of Object.entries(fields)) {
    if (value == null) continue
    updates.push(`${field} = COALESCE(${field}, $${idx})`)
    values.push(value)
    idx++
  }

  if (updates.length === 0) return 0
  values.push(eventId)
  await client.query(
    `UPDATE yabai_travel.events SET ${updates.join(', ')} WHERE id = $${idx} AND (${updates.map((u) => u.split(' = ')[0]).join(' IS NULL OR ')} IS NULL)`,
    values
  )
  return updates.length
}

/** categories を追加（既存がなければ） */
async function insertCategories(client, eventId, categories) {
  if (!categories?.length) return 0
  let count = 0
  for (const cat of categories) {
    const exists = await client.query(
      'SELECT id FROM yabai_travel.categories WHERE event_id = $1 AND name = $2',
      [eventId, cat.name]
    )
    if (exists.rows.length > 0) continue

    const fee = cat.entry_fee != null ? parseInt(cat.entry_fee, 10) : null
    await client.query(
      `INSERT INTO yabai_travel.categories (event_id, name, distance_km, elevation_gain, entry_fee, start_time, time_limit, mandatory_gear)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        eventId,
        cat.name,
        cat.distance_km ?? null,
        cat.elevation_gain ?? null,
        fee,
        cat.start_time ?? null,
        cat.time_limit ?? null,
        cat.mandatory_gear ?? null,
      ]
    )
    count++
  }
  return count
}

async function run() {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  // 情報が少ない events を優先（seed データの Mt. Fuji 等は除外）
  const { rows } = await client.query(`
    SELECT e.id, e.name, e.official_url, e.race_type, e.location, e.country,
           e.entry_start, e.entry_end, e.reception_place, e.start_place,
           (SELECT COUNT(*) FROM yabai_travel.categories WHERE event_id = e.id) as cat_count
    FROM yabai_travel.events e
    WHERE e.official_url IS NOT NULL
      AND e.official_url NOT LIKE '%example.com%'
    ORDER BY
      (CASE WHEN e.location IS NULL THEN 0 ELSE 1 END) +
      (CASE WHEN e.country IS NULL THEN 0 ELSE 1 END) +
      (SELECT COUNT(*) FROM yabai_travel.categories WHERE event_id = e.id)
    ASC
  `)

  const targets = rows.slice(0, LIMIT)
  console.log(`対象: ${targets.length} 件 (DRY_RUN: ${DRY_RUN})\n`)

  const results = []
  let totalTokens = 0

  for (let i = 0; i < targets.length; i++) {
    const event = targets[i]
    const label = `[${i + 1}/${targets.length}]`

    try {
      const html = await fetchHtml(event.official_url)
      const content = extractRelevantContent(html)

      if (content.length < 50) {
        console.log(`${label} SKIP ${event.name?.slice(0, 35)} (ページ内容なし)`)
        results.push({ name: event.name, status: 'skip', reason: 'empty' })
        continue
      }

      const extracted = await extractWithLlm(content, event.name, anthropic)
      totalTokens += extracted._usage.input_tokens + extracted._usage.output_tokens

      if (!DRY_RUN) {
        const updatedFields = await updateEvent(client, event.id, extracted)
        const newCats = await insertCategories(client, event.id, extracted.categories)
        console.log(`${label} OK ${event.name?.slice(0, 35)} | updated:${updatedFields} cats:+${newCats} | tokens:${extracted._usage.input_tokens}+${extracted._usage.output_tokens}`)
      } else {
        console.log(`${label} DRY ${event.name?.slice(0, 35)} | tokens:${extracted._usage.input_tokens}+${extracted._usage.output_tokens}`)
        console.log(`  event: ${JSON.stringify(extracted.event, null, 0).slice(0, 120)}...`)
        console.log(`  categories: ${extracted.categories?.length ?? 0} 件`)
      }

      results.push({
        name: event.name,
        status: 'ok',
        extracted: extracted,
      })
    } catch (e) {
      console.log(`${label} ERR ${event.name?.slice(0, 35)} | ${e.message}`)
      results.push({ name: event.name, status: 'error', error: e.message })
    }
  }

  await client.end()

  console.log(`\n--- Summary ---`)
  console.log(`OK: ${results.filter((r) => r.status === 'ok').length}`)
  console.log(`Skip: ${results.filter((r) => r.status === 'skip').length}`)
  console.log(`Error: ${results.filter((r) => r.status === 'error').length}`)
  console.log(`Total tokens: ${totalTokens}`)

  const outPath = resolve(process.cwd(), 'scripts/crawl/enrichment-result.json')
  writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8')
  console.log(`結果: ${outPath}`)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
