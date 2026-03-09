/**
 * ③ ロジスティクス情報エンリッチスクリプト
 * events テーブルのうち access_routes が未登録なレコードを対象に、
 * アクセス・宿泊情報を収集して DB を更新
 *
 * 使い方:
 *   node scripts/crawl/enrich-logi.js                   # 全未処理件
 *   node scripts/crawl/enrich-logi.js --event-id <uuid> # 特定イベントのみ
 *   node scripts/crawl/enrich-logi.js --dry-run          # DB更新なし
 *   node scripts/crawl/enrich-logi.js --limit 5          # 最初の5件のみ
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

/** Google Directions API でルート情報を取得 */
async function fetchGoogleDirections(origin, destination, apiKey) {
  const params = new URLSearchParams({
    origin,
    destination,
    mode: 'transit',
    language: 'ja',
    key: apiKey,
  })
  const url = `https://maps.googleapis.com/maps/api/directions/json?${params}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`Google Directions API: ${res.status}`)
    return res.json()
  } catch (e) {
    clearTimeout(timer)
    throw e
  }
}

/** Google Directions レスポンスからルート情報を抽出 */
function parseGoogleDirections(data) {
  if (!data.routes || data.routes.length === 0) return null

  const route = data.routes[0]
  const leg = route.legs?.[0]
  if (!leg) return null

  const totalTime = leg.duration?.text || null
  const steps = (leg.steps || [])
    .map((s) => s.html_instructions?.replace(/<[^>]+>/g, '') || '')
    .filter(Boolean)
    .join(' → ')

  // 概算費用（Directions API では提供されないため null）
  return {
    route_detail: steps || leg.summary || null,
    total_time_estimate: totalTime,
    cost_estimate: null,
  }
}

/** LLM で国内アクセス情報を取得 */
async function fetchDomesticLogiWithLlm(anthropic, location) {
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `東京から「${location}」への公共交通機関での経路・所要時間・費用概算を教えてください。また、シャトルバスやタクシーの情報があれば合わせて教えてください。
以下のJSON形式で回答してください：
{
  "route_detail": "経路の詳細（ステップごと）",
  "total_time_estimate": "所要時間（例: 約2時間30分）",
  "cost_estimate": "費用概算（例: 約3,000円〜5,000円）",
  "shuttle_available": "シャトルバス情報（あれば）",
  "taxi_estimate": "タクシー概算費用（あれば）"
}
JSONのみ返してください。`,
      },
    ],
  })

  const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  return JSON.parse(jsonMatch[0])
}

/** LLM で国際アクセス情報を取得 */
async function fetchInternationalLogiWithLlm(anthropic, location, country) {
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `日本（羽田・成田）から「${location}」（${country}）への一般的なアクセス方法を教えてください。往路・復路の概略経路、フライト所要時間、費用感を含めてください。
以下のJSON形式で回答してください：
{
  "outbound": {
    "route_detail": "往路の経路詳細",
    "total_time_estimate": "所要時間",
    "cost_estimate": "費用概算"
  },
  "return": {
    "route_detail": "復路の経路詳細",
    "total_time_estimate": "所要時間",
    "cost_estimate": "費用概算"
  }
}
JSONのみ返してください。`,
      },
    ],
  })

  const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  return JSON.parse(jsonMatch[0])
}

/** LLM で宿泊情報を取得 */
async function fetchAccommodationWithLlm(anthropic, location) {
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `「${location}」大会参加者向けの前泊推奨エリアと星3相当の宿泊費用目安を教えてください。
以下のJSON形式で回答してください：
{
  "recommended_area": "推奨宿泊エリア",
  "avg_cost_3star": 数値（1泊あたり円換算の目安、数値のみ）
}
JSONのみ返してください。`,
      },
    ],
  })

  const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  return JSON.parse(jsonMatch[0])
}

const DISCLAIMER = '\n※ この情報は目安です。実際のフライト・交通手段は出発前にご確認ください。'

/**
 * 単一イベントのロジ情報をエンリッチする
 * @param {object} event - {id, name, location, country}
 * @param {object} opts - {dryRun: boolean}
 * @returns {Promise<{success: boolean, eventId: string, error?: string}>}
 */
export async function enrichLogi(event, opts = { dryRun: false }) {
  const { dryRun = false } = opts
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })

  try {
    await client.connect()

    const { id: eventId, name, location, country } = event

    if (!location) {
      return { success: false, eventId, error: 'no location' }
    }

    // 既存の access_routes チェック
    const existing = await client.query(
      'SELECT id FROM yabai_travel.access_routes WHERE event_id = $1',
      [eventId]
    )
    if (existing.rows.length > 0) {
      return { success: true, eventId, error: 'already exists' }
    }

    const isJapan = !country || country === '日本' || country.toLowerCase() === 'japan'
    const apiKey = process.env.GOOGLE_DIRECTIONS_API_KEY

    let outboundRoute = null
    let returnRoute = null
    let shuttleAvailable = null
    let taxiEstimate = null

    if (isJapan) {
      // 国内: Google Directions API or LLM fallback
      if (apiKey) {
        try {
          const outboundData = await fetchGoogleDirections('東京駅', location, apiKey)
          const returnData = await fetchGoogleDirections(location, '東京駅', apiKey)

          outboundRoute = parseGoogleDirections(outboundData)
          returnRoute = parseGoogleDirections(returnData)
        } catch (e) {
          console.warn(`  Google Directions API error: ${e.message}, falling back to LLM`)
        }
      }

      // LLM fallback（APIキーなし or API失敗時）
      if (!outboundRoute) {
        const logiInfo = await fetchDomesticLogiWithLlm(anthropic, location)
        if (logiInfo) {
          outboundRoute = {
            route_detail: logiInfo.route_detail,
            total_time_estimate: logiInfo.total_time_estimate,
            cost_estimate: logiInfo.cost_estimate,
          }
          returnRoute = {
            route_detail: logiInfo.route_detail ? `${logiInfo.route_detail}（逆順）` : null,
            total_time_estimate: logiInfo.total_time_estimate,
            cost_estimate: logiInfo.cost_estimate,
          }
          shuttleAvailable = logiInfo.shuttle_available || null
          taxiEstimate = logiInfo.taxi_estimate || null
        }
      }
    } else {
      // 海外: LLM のみ
      const logiInfo = await fetchInternationalLogiWithLlm(anthropic, location, country || '不明')
      if (logiInfo) {
        const disclaimer = DISCLAIMER
        outboundRoute = {
          route_detail: logiInfo.outbound?.route_detail ? logiInfo.outbound.route_detail + disclaimer : null,
          total_time_estimate: logiInfo.outbound?.total_time_estimate || null,
          cost_estimate: logiInfo.outbound?.cost_estimate || null,
        }
        returnRoute = {
          route_detail: logiInfo.return?.route_detail ? logiInfo.return.route_detail + disclaimer : null,
          total_time_estimate: logiInfo.return?.total_time_estimate || null,
          cost_estimate: logiInfo.return?.cost_estimate || null,
        }
      }
    }

    if (dryRun) {
      console.log(`  DRY enrichLogi: ${name?.slice(0, 40)} | ${isJapan ? '国内' : '海外'} | outbound: ${!!outboundRoute}`)
      return { success: true, eventId }
    }

    // access_routes 挿入
    if (outboundRoute) {
      await client.query(
        `INSERT INTO yabai_travel.access_routes
          (event_id, direction, route_detail, total_time_estimate, cost_estimate, shuttle_available, taxi_estimate)
         VALUES ($1, 'outbound', $2, $3, $4, $5, $6)`,
        [
          eventId,
          outboundRoute.route_detail || null,
          outboundRoute.total_time_estimate || null,
          outboundRoute.cost_estimate || null,
          shuttleAvailable,
          taxiEstimate,
        ]
      )
    }

    if (returnRoute) {
      await client.query(
        `INSERT INTO yabai_travel.access_routes
          (event_id, direction, route_detail, total_time_estimate, cost_estimate, shuttle_available, taxi_estimate)
         VALUES ($1, 'return', $2, $3, $4, $5, $6)`,
        [
          eventId,
          returnRoute.route_detail || null,
          returnRoute.total_time_estimate || null,
          returnRoute.cost_estimate || null,
          shuttleAvailable,
          taxiEstimate,
        ]
      )
    }

    // accommodations 挿入
    const accomInfo = await fetchAccommodationWithLlm(anthropic, location)
    if (accomInfo) {
      await client.query(
        `INSERT INTO yabai_travel.accommodations (event_id, recommended_area, avg_cost_3star)
         VALUES ($1, $2, $3)`,
        [
          eventId,
          accomInfo.recommended_area || null,
          accomInfo.avg_cost_3star != null ? parseInt(accomInfo.avg_cost_3star, 10) : null,
        ]
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
      'SELECT id, name, location, country FROM yabai_travel.events WHERE id = $1',
      [EVENT_ID]
    )
    targets = rows
  } else {
    const { rows } = await client.query(
      `SELECT e.id, e.name, e.location, e.country
       FROM yabai_travel.events e
       LEFT JOIN yabai_travel.access_routes ar ON ar.event_id = e.id
       WHERE e.location IS NOT NULL AND ar.id IS NULL
       ORDER BY e.created_at ASC
       LIMIT $1`,
      [LIMIT === Infinity ? 10000 : LIMIT]
    )
    targets = rows
  }

  await client.end()

  console.log(`=== ロジエンリッチ開始 (DRY_RUN: ${DRY_RUN}, 件数: ${targets.length}) ===\n`)

  let ok = 0, errors = 0

  for (let i = 0; i < targets.length; i++) {
    const event = targets[i]
    const label = `[${i + 1}/${targets.length}]`

    const result = await enrichLogi(event, { dryRun: DRY_RUN })
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
if (process.argv[1]?.endsWith('enrich-logi.js')) {
  runCli().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
