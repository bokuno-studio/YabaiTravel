/**
 * ② 詳細情報エンリッチスクリプト
 * events テーブルの collected_at IS NULL なレコードを対象に、
 * 公式ページ + LLM でカテゴリ・詳細情報を収集して DB を更新
 *
 * 使い方:
 *   node scripts/crawl/enrich-detail.js                        # 全未処理件
 *   node scripts/crawl/enrich-detail.js --event-id <uuid>      # 特定イベントのみ
 *   node scripts/crawl/enrich-detail.js --url <url>            # URLで指定
 *   node scripts/crawl/enrich-detail.js --dry-run              # DB更新なし
 *   node scripts/crawl/enrich-detail.js --limit 5              # 最初の5件のみ
 */
import pg from 'pg'
import Anthropic from '@anthropic-ai/sdk'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import * as cheerio from 'cheerio'

const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  })
}

const LLM_SYSTEM_PROMPT = `あなたはレースイベントの情報抽出エキスパートです。
与えられた公式ページの内容から、以下の JSON 形式で情報を抽出してください。

{
  "event": {
    "name": "正式な大会名",
    "event_date": "YYYY-MM-DD（開催初日）",
    "event_date_end": "YYYY-MM-DD（複数日の場合の最終日）",
    "location": "開催地（都市名, 国）",
    "country": "国名（日本語）",
    "race_type": "spartan|trail|hyrox|obstacle|adventure|marathon|triathlon|devils_circuit|strong_viking|other のいずれか",
    "entry_url": "申込URL（あれば）",
    "entry_start": "YYYY-MM-DD（申込開始日）",
    "entry_end": "YYYY-MM-DD（申込終了日）",
    "reception_place": "受付場所",
    "start_place": "スタート場所"
  },
  "categories": [
    {
      "name": "カテゴリ名",
      "distance_km": 数値,
      "elevation_gain": 数値（メートル）,
      "entry_fee": 数値（現地通貨で、カンマなし）,
      "entry_fee_currency": "JPY|USD|EUR 等のISO通貨コード",
      "start_time": "HH:MM",
      "time_limit": "HH:MM:SS",
      "cutoff_times": [{"point": "地点名", "time": "HH:MM"}],
      "mandatory_gear": "必携品リスト",
      "poles_allowed": true/false
    }
  ]
}

ルール:
- ページに記載がない項目は null にする。推測しない
- 日付は YYYY-MM-DD 形式
- entry_fee は現地通貨の数値。¥5000 → 5000 + "JPY"、$129 → 129 + "USD"、€85 → 85 + "EUR"
- categories は記載されている全カテゴリ
- JSON のみ返す`

// 追加ページを探索するための関連URLパターン
const RELEVANT_URL_PATTERNS = ['/course', '/entry', '/schedule', '/rule', '/access', '/info', '/detail', '/about', '/category', '/distance', '/fee', '/registration']

async function fetchHtml(url, timeoutMs = 15000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'YabaiTravel-Crawl/1.0' },
      redirect: 'follow',
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`${res.status}`)
    return res.text()
  } catch (e) {
    clearTimeout(timer)
    throw e
  }
}

function extractRelevantContent(html, maxChars = 8000) {
  const $ = cheerio.load(html)
  $('script, style, svg, nav, footer, header, iframe, noscript, meta, link').remove()
  $('[class*="cookie"], [class*="banner"], [class*="popup"], [class*="modal"]').remove()
  $('[class*="newsletter"], [class*="subscribe"]').remove()
  const text = $('body').text().replace(/\s+/g, ' ').trim()
  return text.length <= maxChars ? text : text.slice(0, maxChars) + '\n[...truncated]'
}

/** HTML から同一ドメインの関連リンクを抽出 */
function extractRelevantLinks(html, baseUrl) {
  const $ = cheerio.load(html)
  const links = []
  const base = new URL(baseUrl)

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return
    try {
      const absolute = href.startsWith('http') ? href : new URL(href, baseUrl).href
      const parsed = new URL(absolute)
      // 同一ドメインのみ
      if (parsed.hostname !== base.hostname) return
      // 関連パターンにマッチするか
      const path = parsed.pathname.toLowerCase()
      if (RELEVANT_URL_PATTERNS.some((p) => path.includes(p))) {
        if (!links.includes(absolute)) links.push(absolute)
      }
    } catch { /* ignore */ }
  })

  return links.slice(0, 10)
}

async function callLlm(anthropic, pageContent, raceName) {
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: LLM_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `「${raceName}」の公式ページ内容:\n\n${pageContent}` }],
  })
  const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('LLM JSON parse error')
  return { ...JSON.parse(jsonMatch[0]), _usage: msg.usage }
}

/** 高優先度フィールドが欠けているか判定 */
function hasMissingHighPriorityFields(categories) {
  if (!categories || categories.length === 0) return true
  return categories.some((c) =>
    c.distance_km == null || c.entry_fee == null || c.start_time == null
  )
}

/**
 * 単一イベントをエンリッチする
 * @param {object} event - {id, name, official_url, location, country}
 * @param {object} opts - {dryRun: boolean}
 * @returns {Promise<{success: boolean, eventId: string, error?: string}>}
 */
export async function enrichDetail(event, opts = { dryRun: false }) {
  const { dryRun = false } = opts
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })

  try {
    await client.connect()

    const { id: eventId, name, official_url: officialUrl } = event

    if (!officialUrl) {
      return { success: false, eventId, error: 'no official_url' }
    }

    // Pass 1: 公式ページ取得 + LLM 抽出
    let html
    try {
      html = await fetchHtml(officialUrl)
    } catch (e) {
      return { success: false, eventId, error: `fetch failed: ${e.message}` }
    }

    const content = extractRelevantContent(html)
    if (content.length < 50) {
      return { success: false, eventId, error: 'page content too short' }
    }

    let extracted = await callLlm(anthropic, content, name)
    let totalTokens = (extracted._usage?.input_tokens || 0) + (extracted._usage?.output_tokens || 0)

    // Pass 2: 高優先度フィールドが欠けていれば追加ページを探索
    if (hasMissingHighPriorityFields(extracted.categories)) {
      const links = extractRelevantLinks(html, officialUrl)
      const additionalPages = links.slice(0, 3)

      for (const link of additionalPages) {
        try {
          const additionalHtml = await fetchHtml(link)
          const additionalContent = extractRelevantContent(additionalHtml)
          if (additionalContent.length < 50) continue

          const additionalExtracted = await callLlm(anthropic, additionalContent, name)
          totalTokens += (additionalExtracted._usage?.input_tokens || 0) + (additionalExtracted._usage?.output_tokens || 0)

          // null フィールドのみ上書き（COALESCE 相当）
          const ae = additionalExtracted.event || {}
          const e = extracted.event || {}
          extracted.event = {
            name: e.name ?? ae.name,
            event_date: e.event_date ?? ae.event_date,
            event_date_end: e.event_date_end ?? ae.event_date_end,
            location: e.location ?? ae.location,
            country: e.country ?? ae.country,
            race_type: e.race_type ?? ae.race_type,
            entry_url: e.entry_url ?? ae.entry_url,
            entry_start: e.entry_start ?? ae.entry_start,
            entry_end: e.entry_end ?? ae.entry_end,
            reception_place: e.reception_place ?? ae.reception_place,
            start_place: e.start_place ?? ae.start_place,
          }

          // カテゴリは追加ページのものをマージ（名前が一致すれば欠落フィールドを補完）
          if (additionalExtracted.categories?.length > 0) {
            if (!extracted.categories || extracted.categories.length === 0) {
              extracted.categories = additionalExtracted.categories
            } else {
              for (const addCat of additionalExtracted.categories) {
                const existing = extracted.categories.find((c) => c.name === addCat.name)
                if (existing) {
                  existing.distance_km = existing.distance_km ?? addCat.distance_km
                  existing.entry_fee = existing.entry_fee ?? addCat.entry_fee
                  existing.entry_fee_currency = existing.entry_fee_currency ?? addCat.entry_fee_currency
                  existing.start_time = existing.start_time ?? addCat.start_time
                  existing.time_limit = existing.time_limit ?? addCat.time_limit
                  existing.cutoff_times = existing.cutoff_times ?? addCat.cutoff_times
                  existing.mandatory_gear = existing.mandatory_gear ?? addCat.mandatory_gear
                  existing.poles_allowed = existing.poles_allowed ?? addCat.poles_allowed
                  existing.elevation_gain = existing.elevation_gain ?? addCat.elevation_gain
                } else {
                  extracted.categories.push(addCat)
                }
              }
            }
          }

          if (!hasMissingHighPriorityFields(extracted.categories)) break
        } catch { /* ignore additional page errors */ }
      }
    }

    if (dryRun) {
      console.log(`  DRY enrichDetail: ${name?.slice(0, 40)} | cats:${extracted.categories?.length ?? 0} | tokens:${totalTokens}`)
      return { success: true, eventId }
    }

    const e = extracted.event || {}

    // events テーブル更新（COALESCE で null フィールドのみ更新）
    await client.query(
      `UPDATE yabai_travel.events SET
        name = COALESCE(name, $1),
        event_date = COALESCE(event_date, $2),
        location = COALESCE(location, $3),
        country = COALESCE(country, $4),
        race_type = COALESCE(race_type, $5),
        entry_url = COALESCE(entry_url, $6),
        entry_start = COALESCE(entry_start, $7),
        entry_end = COALESCE(entry_end, $8),
        reception_place = COALESCE(reception_place, $9),
        start_place = COALESCE(start_place, $10)
       WHERE id = $11`,
      [
        e.name || null,
        e.event_date || null,
        e.location || null,
        e.country || null,
        e.race_type || null,
        e.entry_url || null,
        e.entry_start || null,
        e.entry_end || null,
        e.reception_place || null,
        e.start_place || null,
        eventId,
      ]
    )

    // categories 挿入（event_id + name で重複チェック）
    for (const cat of extracted.categories || []) {
      if (!cat.name) continue
      const exists = await client.query(
        'SELECT id FROM yabai_travel.categories WHERE event_id = $1 AND name = $2',
        [eventId, cat.name]
      )
      if (exists.rows.length > 0) continue

      await client.query(
        `INSERT INTO yabai_travel.categories
          (event_id, name, distance_km, elevation_gain, entry_fee, entry_fee_currency, start_time, time_limit, cutoff_times, mandatory_gear, poles_allowed)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          eventId,
          cat.name,
          cat.distance_km ?? null,
          cat.elevation_gain ?? null,
          cat.entry_fee != null ? parseInt(cat.entry_fee, 10) : null,
          cat.entry_fee_currency || null,
          cat.start_time || null,
          cat.time_limit || null,
          cat.cutoff_times ? JSON.stringify(cat.cutoff_times) : null,
          cat.mandatory_gear || null,
          cat.poles_allowed ?? null,
        ]
      )
    }

    // collected_at を更新（処理済みマーク）
    await client.query(
      'UPDATE yabai_travel.events SET collected_at = NOW() WHERE id = $1',
      [eventId]
    )

    return { success: true, eventId }
  } catch (e) {
    return { success: false, eventId: event.id, error: e.message }
  } finally {
    try { await client.end() } catch { /* ignore */ }
  }
}

// --- CLI エントリーポイント ---

async function runCli() {
  const args = process.argv.slice(2)
  const DRY_RUN = args.includes('--dry-run')
  const limitIdx = args.indexOf('--limit')
  const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity
  const eventIdIdx = args.indexOf('--event-id')
  const EVENT_ID = eventIdIdx >= 0 ? args[eventIdIdx + 1] : null
  const urlIdx = args.indexOf('--url')
  const URL_ARG = urlIdx >= 0 ? args[urlIdx + 1] : null

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  let targets

  if (EVENT_ID) {
    const { rows } = await client.query(
      'SELECT id, name, official_url, location, country FROM yabai_travel.events WHERE id = $1',
      [EVENT_ID]
    )
    targets = rows
  } else if (URL_ARG) {
    const { rows } = await client.query(
      'SELECT id, name, official_url, location, country FROM yabai_travel.events WHERE official_url = $1',
      [URL_ARG]
    )
    targets = rows
  } else {
    const { rows } = await client.query(
      'SELECT id, name, official_url, location, country FROM yabai_travel.events WHERE collected_at IS NULL ORDER BY created_at ASC LIMIT $1',
      [LIMIT === Infinity ? 10000 : LIMIT]
    )
    targets = rows
  }

  await client.end()

  console.log(`=== 詳細エンリッチ開始 (DRY_RUN: ${DRY_RUN}, 件数: ${targets.length}) ===\n`)

  let ok = 0, errors = 0

  for (let i = 0; i < targets.length; i++) {
    const event = targets[i]
    const label = `[${i + 1}/${targets.length}]`

    const result = await enrichDetail(event, { dryRun: DRY_RUN })
    if (result.success) {
      ok++
      console.log(`${label} OK  ${event.name?.slice(0, 40)}`)
    } else {
      errors++
      console.log(`${label} ERR ${event.name?.slice(0, 40)} | ${result.error?.slice(0, 60)}`)
    }
  }

  console.log(`\n=== 完了 ===`)
  console.log(`OK: ${ok}, Errors: ${errors}`)
}

// スクリプトとして直接実行された場合のみ CLI を起動
if (process.argv[1]?.endsWith('enrich-detail.js')) {
  runCli().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
