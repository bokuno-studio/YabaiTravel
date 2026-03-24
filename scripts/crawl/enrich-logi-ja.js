/**
 * ③-ja 日本語版ロジ（東京起点）
 * events テーブルのうち access_routes が未登録なレコードを対象に、
 * アクセス・宿泊情報を収集して DB を更新
 *
 * #329 改善: transit_accessible を full/partial/none の3段階で判定し、
 * partial の場合はタクシー必要区間と費用見積もりを提供
 *
 * 使い方:
 *   node scripts/crawl/enrich-logi-ja.js                   # 全未処理件
 *   node scripts/crawl/enrich-logi-ja.js --event-id <uuid> # 特定イベントのみ
 *   node scripts/crawl/enrich-logi-ja.js --dry-run          # DB更新なし
 *   node scripts/crawl/enrich-logi-ja.js --limit 5          # 最初の5件のみ
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

/** Routes API でルート情報を取得（Directions API Legacy の後継、polyline 付き） */
async function fetchGoogleDirections(origin, destination, apiKey) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.duration,routes.polyline.encodedPolyline,routes.legs.duration,routes.legs.steps.navigationInstruction,routes.legs.steps.transitDetails',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        origin: { address: origin },
        destination: { address: destination },
        travelMode: 'TRANSIT',
        languageCode: 'ja',
      }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`Google Routes API: ${res.status}`)
    return res.json()
  } catch (e) {
    clearTimeout(timer)
    throw e
  }
}

/** 秒数文字列（例: "5400s"）を日本語表記に変換 */
function formatDuration(durationStr) {
  if (!durationStr) return null
  const secs = parseInt(durationStr, 10)
  if (isNaN(secs)) return null
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h > 0 && m > 0) return `約${h}時間${m}分`
  if (h > 0) return `約${h}時間`
  return `約${m}分`
}

/** Routes API レスポンスからルート情報を抽出（polyline 付き） */
function parseGoogleDirections(data) {
  if (!data.routes || data.routes.length === 0) return null

  const route = data.routes[0]
  const leg = route.legs?.[0]
  if (!leg) return null

  const totalTime = formatDuration(route.duration)
  const steps = (leg.steps || [])
    .map((s, i) => {
      const instr = s.navigationInstruction?.instructions || ''
      return instr ? `${i + 1}. ${instr}` : ''
    })
    .filter(Boolean)
    .join('\n')
  const polyline = route.polyline?.encodedPolyline || null

  return {
    route_detail: steps || null,
    total_time_estimate: totalTime,
    cost_estimate: null,
    route_polyline: polyline,
  }
}

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

/**
 * LLM で国内アクセス情報を取得（#329 改善: 3段階タクシー判定）
 * transit_accessible: "full" | "partial" | "none"
 */
async function fetchDomesticLogiWithLlm(anthropic, location) {
  const msg = await callLlmWithRetry(anthropic, {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    messages: [
      {
        role: 'user',
        content: `東京から「${location}」への経路を教えてください。
飛行機・電車・路線バス・フェリーのみを使った経路にしてください。タクシーは経路に含めないでください。
日本語と英語の両方で回答してください。
以下のJSON形式で回答してください：
{
  "transit_accessible": "full" または "partial" または "none"（full: 公共交通のみで会場到着可能 / partial: 最寄り駅まで公共交通、そこからタクシー必要 / none: タクシーまたはレンタカー推奨）,
  "transit_detail": "full/partial/noneの判定理由を簡潔に（日本語）",
  "route_detail": "公共交通のみの経路詳細（タクシー不使用）（日本語）。番号付きで各ステップを改行区切りで記載（例: 1. 東京駅から新幹線で…\\n2. ○○駅からバスで…）",
  "route_detail_en": "Route details using public transit only (no taxi) (English). Numbered steps separated by newlines",
  "total_time_estimate": "所要時間（例: 約2時間30分）",
  "cost_estimate": "費用概算（公共交通のみ。例: 約3,000円〜5,000円）",
  "shuttle_available": "大会公式シャトルバスの情報（日本語）。公式シャトルがない場合や不明な場合は必ず null を返すこと。一般的なバスやタクシー情報は含めない",
  "shuttle_available_en": "Official race shuttle bus info (English). Return null if no official shuttle or unknown. Do not include general bus/taxi info",
  "taxi_required_segment": "partial の場合のみ: タクシー必要区間（例: ○○駅 → 会場（約10km））。full/none なら必ず null",
  "taxi_estimate": "partial の場合のみ: タクシー費用概算（例: 約3,000円）。full/none なら必ず null"
}
JSONのみ返してください。`,
      },
    ],
  })

  const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  const parsed = JSON.parse(jsonMatch[0])
  // LLMが "不明"/"情報なし"/"null" 等を返した場合にnullに正規化
  const nullify = (v) => {
    if (v == null) return null
    if (typeof v !== 'string') return v
    const s = v.trim().toLowerCase()
    if (!s || s === 'null' || s === '不明' || s === '情報なし' || s === 'なし' || s === 'n/a' || s === 'unknown' || s === 'none') return null
    return v
  }
  parsed.shuttle_available = nullify(parsed.shuttle_available)
  parsed.shuttle_available_en = nullify(parsed.shuttle_available_en)
  parsed.taxi_required_segment = nullify(parsed.taxi_required_segment)
  parsed.taxi_estimate = nullify(parsed.taxi_estimate)
  return parsed
}

/** 公式ページからシャトルバス情報を抽出（大会公式情報のみ） */
async function extractOfficialShuttle(officialUrl) {
  if (!officialUrl) return null
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)
    const res = await fetch(officialUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' },
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const html = await res.text()
    // HTMLタグを除去してテキスト化
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
    // シャトルバスキーワードの前後を抽出
    const patterns = [
      /シャトルバス.{0,100}/,
      /シャトル運行.{0,100}/,
      /大会シャトル.{0,100}/,
      /shuttle\s*bus.{0,100}/i,
    ]
    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match) return match[0].replace(/\s+/g, ' ').trim().slice(0, 200)
    }
    return null
  } catch {
    return null
  }
}

/** LLM で国際アクセス情報を取得 */
async function fetchInternationalLogiWithLlm(anthropic, location, country) {
  const msg = await callLlmWithRetry(anthropic, {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    messages: [
      {
        role: 'user',
        content: `日本（羽田・成田）から「${location}」（${country}）への一般的なアクセス方法を教えてください。往路・復路の概略経路、フライト所要時間、費用感を含めてください。
日本語と英語の両方で回答してください。
以下のJSON形式で回答してください：
{
  "outbound": {
    "route_detail": "往路の経路詳細（日本語）",
    "route_detail_en": "Outbound route details (English)",
    "total_time_estimate": "所要時間",
    "cost_estimate": "費用概算",
    "shuttle_available": "シャトルバス情報（日本語。不明なら null）",
    "shuttle_available_en": "Shuttle bus info (English. null if unknown)"
  },
  "return": {
    "route_detail": "復路の経路詳細（日本語）",
    "route_detail_en": "Return route details (English)",
    "total_time_estimate": "所要時間",
    "cost_estimate": "費用概算",
    "shuttle_available": "シャトルバス情報（日本語。不明なら null）",
    "shuttle_available_en": "Shuttle bus info (English. null if unknown)"
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
  const msg = await callLlmWithRetry(anthropic, {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 768,
    messages: [
      {
        role: 'user',
        content: `「${location}」大会参加者向けの前泊推奨エリアと星3相当の宿泊費用目安を教えてください。
日本語と英語の両方で回答してください。
以下のJSON形式で回答してください：
{
  "recommended_area": "推奨宿泊エリア（日本語）",
  "recommended_area_en": "Recommended accommodation area (English)",
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

/**
 * transit_accessible の文字列値を boolean に変換（DB 後方互換）
 * "full" → true, "partial" → true, "none" → false
 * 旧形式（true/false）もそのまま対応
 */
function transitAccessibleToBoolean(value) {
  if (typeof value === 'boolean') return value
  if (value === 'full' || value === 'partial') return true
  if (value === 'none') return false
  return null
}

/**
 * タクシー情報を組み立て（#329: 区間情報 + 費用見積もりを統合）
 */
function buildTaxiEstimate(logiInfo) {
  if (!logiInfo) return null
  const accessible = logiInfo.transit_accessible
  // full の場合はタクシー不要
  if (accessible === 'full' || accessible === true) return null

  const parts = []
  if (logiInfo.taxi_required_segment) {
    parts.push(logiInfo.taxi_required_segment)
  }
  if (logiInfo.taxi_estimate) {
    parts.push(logiInfo.taxi_estimate)
  }
  return parts.length > 0 ? parts.join(' / ') : null
}

const DISCLAIMER = '\n※ この情報は目安です。実際のフライト・交通手段は出発前にご確認ください。'
const DISCLAIMER_EN = '\n* This information is approximate. Please verify actual flights and transportation before departure.'

/**
 * 単一イベントのロジ情報をエンリッチする（日本語版・東京起点）
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

    const { id: eventId, name, location, country, official_url: officialUrl } = event

    if (!location) {
      return { success: false, eventId, error: 'no location' }
    }

    // 既存の access_routes を direction + origin_type 別に確認（tokyo のみ対象）
    const existingRoutes = await client.query(
      `SELECT id, direction FROM ${SCHEMA}.access_routes WHERE event_id = $1 AND origin_type = 'tokyo'`,
      [eventId]
    )
    const existingDirections = new Set(existingRoutes.rows.map((r) => r.direction))
    const existingIds = Object.fromEntries(existingRoutes.rows.map((r) => [r.direction, r.id]))

    const isJapan = !country || country === '日本' || country.toLowerCase() === 'japan'
    const apiKey = process.env.GOOGLE_DIRECTIONS_API_KEY

    let outboundRoute = null
    let returnRoute = null
    let shuttleAvailable = null
    let taxiEstimate = null
    let transitAccessible = null

    // 公式ページからシャトルバス情報を抽出（大会公式情報のみ）
    shuttleAvailable = await extractOfficialShuttle(officialUrl)

    if (isJapan) {
      // 国内: Google Directions API or LLM fallback
      if (apiKey) {
        try {
          const outboundData = await fetchGoogleDirections('東京駅', location, apiKey)
          outboundRoute = parseGoogleDirections(outboundData)
          // スタート=ゴール同一（大半のレース）: 復路は往路と同じ。API呼び出しを省略
          if (outboundRoute) {
            returnRoute = { ...outboundRoute }
            transitAccessible = true
          }
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
            route_detail_en: logiInfo.route_detail_en || null,
            total_time_estimate: logiInfo.total_time_estimate,
            cost_estimate: logiInfo.cost_estimate,
            shuttle_available_en: logiInfo.shuttle_available_en || null,
          }
          returnRoute = {
            route_detail: logiInfo.route_detail || null,
            route_detail_en: logiInfo.route_detail_en || null,
            total_time_estimate: logiInfo.total_time_estimate,
            cost_estimate: logiInfo.cost_estimate,
            shuttle_available_en: logiInfo.shuttle_available_en || null,
          }
          // LLM からのシャトル情報がある場合、公式ページ抽出の結果がなければ補完
          if (!shuttleAvailable && logiInfo.shuttle_available) {
            shuttleAvailable = logiInfo.shuttle_available
          }
          transitAccessible = transitAccessibleToBoolean(logiInfo.transit_accessible)
          // #329: タクシー情報を区間+費用で組み立て
          taxiEstimate = buildTaxiEstimate(logiInfo)
        }
      }
    } else {
      // 海外: LLM + 最寄り空港→会場のpolyline取得
      const logiInfo = await fetchInternationalLogiWithLlm(anthropic, location, country || '不明')
      let intlPolyline = null
      // 最寄り空港→会場のpolylineを取得（enrich-logi-en.jsのvenue_accessデータから）
      if (apiKey) {
        try {
          const { rows: vaRoutes } = await client.query(
            `SELECT route_polyline FROM ${SCHEMA}.access_routes WHERE event_id = $1 AND origin_type = 'venue_access' AND route_polyline IS NOT NULL`,
            [eventId]
          )
          if (vaRoutes.length > 0) {
            intlPolyline = vaRoutes[0].route_polyline
          }
        } catch { /* ignore */ }
      }
      if (logiInfo) {
        outboundRoute = {
          route_detail: logiInfo.outbound?.route_detail ? logiInfo.outbound.route_detail + DISCLAIMER : null,
          route_detail_en: logiInfo.outbound?.route_detail_en ? logiInfo.outbound.route_detail_en + DISCLAIMER_EN : null,
          total_time_estimate: logiInfo.outbound?.total_time_estimate || null,
          cost_estimate: logiInfo.outbound?.cost_estimate || null,
          shuttle_available_en: logiInfo.outbound?.shuttle_available_en || null,
          route_polyline: intlPolyline,
        }
        returnRoute = {
          route_detail: logiInfo.outbound?.route_detail ? logiInfo.outbound.route_detail + DISCLAIMER : null,
          route_detail_en: logiInfo.outbound?.route_detail_en ? logiInfo.outbound.route_detail_en + DISCLAIMER_EN : null,
          total_time_estimate: logiInfo.outbound?.total_time_estimate || null,
          cost_estimate: logiInfo.outbound?.cost_estimate || null,
          shuttle_available_en: logiInfo.outbound?.shuttle_available_en || null,
          route_polyline: intlPolyline,
        }
        // LLM からのシャトル情報がある場合、公式ページ抽出の結果がなければ補完
        if (!shuttleAvailable && logiInfo.outbound?.shuttle_available) {
          shuttleAvailable = logiInfo.outbound.shuttle_available
        }
      }
    }

    if (dryRun) {
      console.log(`  DRY enrichLogi-ja: ${name?.slice(0, 40)} | ${isJapan ? '国内' : '海外'} | outbound: ${!!outboundRoute}`)
      return { success: true, eventId }
    }

    // access_routes: 方向ごとに INSERT or COALESCE UPDATE（origin_type='tokyo'）
    const upsertRoute = async (direction, route) => {
      if (!route) return
      const params = [
        route.route_detail || null,
        route.total_time_estimate || null,
        route.cost_estimate || null,
        shuttleAvailable,
        taxiEstimate,
        transitAccessible,
        route.route_detail_en || null,
        route.shuttle_available_en || null,
        route.route_polyline || null,
      ]
      if (existingDirections.has(direction)) {
        await client.query(
          `UPDATE ${SCHEMA}.access_routes SET
            route_detail        = COALESCE(route_detail, $2),
            total_time_estimate = COALESCE(total_time_estimate, $3),
            cost_estimate       = COALESCE(cost_estimate, $4),
            shuttle_available   = COALESCE(shuttle_available, $5),
            taxi_estimate       = COALESCE(taxi_estimate, $6),
            transit_accessible  = COALESCE(transit_accessible, $7),
            route_detail_en     = COALESCE(route_detail_en, $8),
            shuttle_available_en = COALESCE(shuttle_available_en, $9),
            route_polyline      = COALESCE(route_polyline, $10)
           WHERE id = $1`,
          [existingIds[direction], ...params]
        )
      } else {
        await client.query(
          `INSERT INTO ${SCHEMA}.access_routes
            (event_id, direction, origin_type, route_detail, total_time_estimate, cost_estimate, shuttle_available, taxi_estimate, transit_accessible, route_detail_en, shuttle_available_en, route_polyline)
           VALUES ($1, $2, 'tokyo', $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [eventId, direction, ...params]
        )
      }
    }

    await upsertRoute('outbound', outboundRoute)
    await upsertRoute('return', returnRoute)

    // accommodations: なければ INSERT、あれば空フィールド補完
    const accomInfo = await fetchAccommodationWithLlm(anthropic, location)
    if (accomInfo) {
      const existingAccom = await client.query(
        `SELECT id FROM ${SCHEMA}.accommodations WHERE event_id = $1`,
        [eventId]
      )
      const accomArea = accomInfo.recommended_area || null
      const accomAreaEn = accomInfo.recommended_area_en || null
      const accomCost = accomInfo.avg_cost_3star != null ? parseInt(accomInfo.avg_cost_3star, 10) : null
      if (existingAccom.rows.length > 0) {
        await client.query(
          `UPDATE ${SCHEMA}.accommodations SET
            recommended_area    = COALESCE(recommended_area, $2),
            avg_cost_3star      = COALESCE(avg_cost_3star, $3),
            recommended_area_en = COALESCE(recommended_area_en, $4)
           WHERE id = $1`,
          [existingAccom.rows[0].id, accomArea, accomCost, accomAreaEn]
        )
      } else {
        await client.query(
          `INSERT INTO ${SCHEMA}.accommodations (event_id, recommended_area, avg_cost_3star, recommended_area_en)
           VALUES ($1, $2, $3, $4)`,
          [eventId, accomArea, accomCost, accomAreaEn]
        )
      }
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
      `SELECT id, name, location, country, official_url FROM ${SCHEMA}.events WHERE id = $1`,
      [EVENT_ID]
    )
    targets = rows
  } else {
    const { rows } = await client.query(
      `SELECT e.id, e.name, e.location, e.country, e.official_url
       FROM ${SCHEMA}.events e
       LEFT JOIN ${SCHEMA}.access_routes ar ON ar.event_id = e.id AND ar.origin_type = 'tokyo'
       WHERE e.location IS NOT NULL AND ar.id IS NULL
       ORDER BY e.updated_at ASC
       LIMIT $1`,
      [LIMIT === Infinity ? 10000 : LIMIT]
    )
    targets = rows
  }

  await client.end()

  console.log(`=== ロジエンリッチ（日本語版）開始 (DRY_RUN: ${DRY_RUN}, 件数: ${targets.length}) ===\n`)

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
if (process.argv[1]?.endsWith('enrich-logi-ja.js')) {
  runCli().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
