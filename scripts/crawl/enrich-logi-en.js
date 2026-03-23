/**
 * ③-en 英語版ロジ（会場アクセスポイント情報）
 * 起点を固定せず、会場側の到達方法を提示（国際的な訪問者向け）
 *
 * 使い方:
 *   node scripts/crawl/enrich-logi-en.js                   # 全未処理件
 *   node scripts/crawl/enrich-logi-en.js --event-id <uuid> # 特定イベントのみ
 *   node scripts/crawl/enrich-logi-en.js --dry-run          # DB更新なし
 *   node scripts/crawl/enrich-logi-en.js --limit 5          # 最初の5件のみ
 */
import pg from 'pg'
import Anthropic from '@anthropic-ai/sdk'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  })
}

const SCHEMA = process.env.SUPABASE_SCHEMA ?? 'yabai_travel'

/** LLM 呼び出しのラッパー（429時に60秒待機してリトライ） */
async function callLlmWithRetry(anthropic, params) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await anthropic.messages.create(params)
    } catch (e) {
      if (attempt === 0 && e.status === 429) {
        console.warn(`  [LLM] 429 rate limit、60秒待機してリトライ...`)
        await new Promise((r) => setTimeout(r, 60000))
        continue
      }
      throw e
    }
  }
}

/** LLM で会場アクセスポイント情報を取得 */
async function fetchVenueAccessWithLlm(anthropic, location, country) {
  const msg = await callLlmWithRetry(anthropic, {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: `For the event venue at "${location}" (${country || 'unknown country'}), provide access information for international visitors.

Return JSON only:
{
  "nearest_airports": [
    {"name": "Airport Name", "code": "XXX", "distance_km": 75, "transport_to_venue": "Bus 2h (~$30) or rental car 1.5h"}
  ],
  "nearest_stations": [
    {"name": "Station Name", "network": "SNCF/JR/etc", "transport_to_venue": "Walk 10min"}
  ],
  "access_summary": "Brief English summary of how to reach the venue from major transport hubs",
  "access_summary_ja": "会場への主要交通手段からのアクセス方法（日本語）",
  "recommended_area": "Best area to stay near the venue (English)",
  "recommended_area_ja": "会場付近のおすすめ宿泊エリア（日本語）",
  "avg_cost_3star": number (USD per night for 3-star hotel, number only)
}
Return JSON only.`,
      },
    ],
  })

  const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  return JSON.parse(jsonMatch[0])
}

/**
 * 空港・駅情報をフォーマットしてルート詳細テキストに変換
 */
function formatAccessRouteDetail(venueInfo) {
  if (!venueInfo) return { en: null, ja: null }

  const parts_en = []
  const parts_ja = []

  // 空港情報
  if (venueInfo.nearest_airports?.length > 0) {
    parts_en.push('Nearest airports:')
    parts_ja.push('最寄り空港:')
    for (const apt of venueInfo.nearest_airports) {
      const code = apt.code ? ` (${apt.code})` : ''
      const dist = apt.distance_km ? ` - ${apt.distance_km}km` : ''
      parts_en.push(`  ${apt.name}${code}${dist}: ${apt.transport_to_venue}`)
      parts_ja.push(`  ${apt.name}${code}${dist}: ${apt.transport_to_venue}`)
    }
  }

  // 駅情報
  if (venueInfo.nearest_stations?.length > 0) {
    parts_en.push('Nearest stations:')
    parts_ja.push('最寄り駅:')
    for (const stn of venueInfo.nearest_stations) {
      const net = stn.network ? ` (${stn.network})` : ''
      parts_en.push(`  ${stn.name}${net}: ${stn.transport_to_venue}`)
      parts_ja.push(`  ${stn.name}${net}: ${stn.transport_to_venue}`)
    }
  }

  return {
    en: parts_en.length > 0 ? parts_en.join('\n') : null,
    ja: parts_ja.length > 0 ? parts_ja.join('\n') : null,
  }
}

/**
 * 単一イベントの英語版ロジ情報をエンリッチする（会場アクセスポイント）
 * @param {object} event - {id, name, location, country}
 * @param {object} opts - {dryRun: boolean}
 * @returns {Promise<{success: boolean, eventId: string, error?: string}>}
 */
export async function enrichLogiEn(event, opts = { dryRun: false }) {
  const { dryRun = false } = opts
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })

  try {
    await client.connect()

    const { id: eventId, name, location, country } = event

    if (!location) {
      return { success: false, eventId, error: 'no location' }
    }

    // 既存の venue_access ルートを確認
    const existingRoutes = await client.query(
      `SELECT id FROM ${SCHEMA}.access_routes WHERE event_id = $1 AND origin_type = 'venue_access'`,
      [eventId]
    )
    // 既にあればスキップ（COALESCE で空フィールド補完のみ）
    const existingId = existingRoutes.rows[0]?.id || null

    const venueInfo = await fetchVenueAccessWithLlm(anthropic, location, country)
    if (!venueInfo) {
      return { success: false, eventId, error: 'LLM returned no venue access info' }
    }

    if (dryRun) {
      console.log(`  DRY enrichLogi-en: ${name?.slice(0, 40)} | airports: ${venueInfo.nearest_airports?.length ?? 0}, stations: ${venueInfo.nearest_stations?.length ?? 0}`)
      return { success: true, eventId }
    }

    // ルート詳細をフォーマット
    const routeDetail = formatAccessRouteDetail(venueInfo)
    const accessSummaryEn = venueInfo.access_summary || null
    const accessSummaryJa = venueInfo.access_summary_ja || null

    // route_detail にフォーマットされた空港・駅情報、route_detail_en にアクセスサマリーを格納
    const routeDetailJa = [routeDetail.ja, accessSummaryJa].filter(Boolean).join('\n\n') || null
    const routeDetailEn = [routeDetail.en, accessSummaryEn].filter(Boolean).join('\n\n') || null

    if (existingId) {
      // 既存レコードの空フィールドのみ補完
      await client.query(
        `UPDATE ${SCHEMA}.access_routes SET
          route_detail     = COALESCE(route_detail, $2),
          route_detail_en  = COALESCE(route_detail_en, $3)
         WHERE id = $1`,
        [existingId, routeDetailJa, routeDetailEn]
      )
    } else {
      // 新規 INSERT
      await client.query(
        `INSERT INTO ${SCHEMA}.access_routes
          (event_id, direction, origin_type, route_detail, route_detail_en)
         VALUES ($1, 'access', 'venue_access', $2, $3)`,
        [eventId, routeDetailJa, routeDetailEn]
      )
    }

    // accommodations: 空フィールド補完のみ（③-ja で既に作成済みの場合が多い）
    const recommendedAreaEn = venueInfo.recommended_area || null
    const recommendedAreaJa = venueInfo.recommended_area_ja || null
    const avgCost = venueInfo.avg_cost_3star != null ? parseInt(venueInfo.avg_cost_3star, 10) : null

    const existingAccom = await client.query(
      `SELECT id FROM ${SCHEMA}.accommodations WHERE event_id = $1`,
      [eventId]
    )

    if (existingAccom.rows.length > 0) {
      await client.query(
        `UPDATE ${SCHEMA}.accommodations SET
          recommended_area    = COALESCE(recommended_area, $2),
          recommended_area_en = COALESCE(recommended_area_en, $3),
          avg_cost_3star      = COALESCE(avg_cost_3star, $4)
         WHERE id = $1`,
        [existingAccom.rows[0].id, recommendedAreaJa, recommendedAreaEn, avgCost]
      )
    } else {
      await client.query(
        `INSERT INTO ${SCHEMA}.accommodations (event_id, recommended_area, recommended_area_en, avg_cost_3star)
         VALUES ($1, $2, $3, $4)`,
        [eventId, recommendedAreaJa, recommendedAreaEn, avgCost]
      )
    }

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

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  let targets

  if (EVENT_ID) {
    const { rows } = await client.query(
      `SELECT id, name, location, country FROM ${SCHEMA}.events WHERE id = $1`,
      [EVENT_ID]
    )
    targets = rows
  } else {
    const { rows } = await client.query(
      `SELECT e.id, e.name, e.location, e.country
       FROM ${SCHEMA}.events e
       LEFT JOIN ${SCHEMA}.access_routes ar ON ar.event_id = e.id AND ar.origin_type = 'venue_access'
       WHERE e.location IS NOT NULL AND e.collected_at IS NOT NULL AND ar.id IS NULL
       ORDER BY e.updated_at ASC
       LIMIT $1`,
      [LIMIT === Infinity ? 10000 : LIMIT]
    )
    targets = rows
  }

  await client.end()

  console.log(`=== ロジエンリッチ（英語版）開始 (DRY_RUN: ${DRY_RUN}, 件数: ${targets.length}) ===\n`)

  let ok = 0, errors = 0

  for (let i = 0; i < targets.length; i++) {
    const event = targets[i]
    const label = `[${i + 1}/${targets.length}]`

    const result = await enrichLogiEn(event, { dryRun: DRY_RUN })
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
if (process.argv[1]?.endsWith('enrich-logi-en.js')) {
  runCli().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
