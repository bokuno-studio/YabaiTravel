/**
 * ③-en 英語版ロジ（会場アクセスポイント情報）
 * Google Places API + Google Routes API で空港・駅を検索し、会場へのルートを取得
 * 取得できない場合のみ LLM フォールバック
 *
 * 使い方:
 *   node scripts/crawl/enrich-logi-en.js                   # 全未処理件（同期API）
 *   node scripts/crawl/enrich-logi-en.js --batch            # 全未処理件（Batch API・50%割引）
 *   node scripts/crawl/enrich-logi-en.js --event-id <uuid> # 特定イベントのみ
 *   node scripts/crawl/enrich-logi-en.js --dry-run          # DB更新なし
 *   node scripts/crawl/enrich-logi-en.js --limit 5          # 最初の5件のみ
 */
import pg from 'pg'
import Anthropic from '@anthropic-ai/sdk'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { runBatch } from './lib/batch-utils.js'

const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  })
}

const SCHEMA = process.env.SUPABASE_SCHEMA ?? 'yabai_travel'

// --- Google APIs ---

/** 2点間の距離（km）を計算 */
function calcDistKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

/** Google Text Search API で周辺の主要空港を検索（レビュー数スコアリング） */
async function searchNearbyAirports(location, apiKey) {
  // まず会場のジオコーディング
  const geocodeRes = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${apiKey}`
  )
  const geocodeData = await geocodeRes.json()
  if (!geocodeData.results?.length) return []
  const { lat, lng } = geocodeData.results[0].geometry.location

  // Text Search で空港を検索（300km圏内）
  const placesRes = await fetch(
    `https://maps.googleapis.com/maps/api/place/textsearch/json?query=airport&location=${lat},${lng}&radius=300000&language=en&key=${apiKey}`
  )
  const placesData = await placesRes.json()
  if (!placesData.results?.length) return []

  // フィルタ + レビュー数÷距離でスコアリング → 上位2件
  const airports = placesData.results
    .filter(p => {
      if (!p.geometry?.location) return false
      if (!p.types?.includes('airport')) return false
      const n = p.name.toLowerCase()
      if (n.includes('heli')) return false
      if (n.includes('aerodrom') || n.includes('aérodrom') || n.includes('aeródromo')) return false
      if (n.includes('parking') || n.includes('lounge') || n.includes('rental') || n.includes('taxi') || n.includes('shuttle')) return false
      return true
    })
    .map(p => {
      const dist = calcDistKm(lat, lng, p.geometry.location.lat, p.geometry.location.lng)
      const ratings = p.user_ratings_total || 0
      const score = ratings / Math.max(dist, 1)
      return { name: p.name, lat: p.geometry.location.lat, lng: p.geometry.location.lng, distance_km: dist, score }
    })
    .filter(p => p.distance_km <= 300)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)

  return airports
}

/** Google Places API で周辺の駅を検索 */
async function searchNearbyStations(location, apiKey) {
  const geocodeRes = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${apiKey}`
  )
  const geocodeData = await geocodeRes.json()
  if (!geocodeData.results?.length) return []
  const { lat, lng } = geocodeData.results[0].geometry.location

  const placesRes = await fetch(
    `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=30000&type=train_station&language=en&key=${apiKey}`
  )
  const placesData = await placesRes.json()
  if (!placesData.results?.length) return []

  // Place Details API で英語名を取得する関数
  async function getEnglishName(placeId) {
    try {
      const detailRes = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name&language=en&key=${apiKey}`
      )
      const detailData = await detailRes.json()
      return detailData.result?.name || null
    } catch { return null }
  }

  const stations = placesData.results
    .filter(p => p.geometry?.location)
    .map(p => {
      const dist = calcDistKm(lat, lng, p.geometry.location.lat, p.geometry.location.lng)
      return { name: p.name, placeId: p.place_id, lat: p.geometry.location.lat, lng: p.geometry.location.lng, distance_km: dist }
    })
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, 1)

  // Nearby Search の language=en が効かない場合があるため、Place Details で英語名を取得
  for (const s of stations) {
    if (s.placeId) {
      const enName = await getEnglishName(s.placeId)
      if (enName && enName !== s.name) {
        s.name = enName
      } else if (/[^\x00-\x7F]/.test(s.name)) {
        // Place Details でも非ASCII名の場合、formatted_address から英語名を生成
        try {
          const pdRes = await fetch(
            `https://maps.googleapis.com/maps/api/place/details/json?place_id=${s.placeId}&fields=formatted_address&language=en&key=${apiKey}`
          )
          const pdData = await pdRes.json()
          const addr = pdData.result?.formatted_address || ''
          // formatted_address の先頭要素（通常は場所名のピンイン）または市名を取得
          // 例: "Zhan Qian Jie, Qiao Xi Qu, Shi Jia Zhuang Shi, He Bei Sheng, China, 050001"
          // → locality に相当する部分を抽出
          const parts = addr.split(',').map(p => p.trim())
          // "Shi" で終わる部分が市名（中国のピンイン表記: XxxShi = Xxx市）
          const cityPart = parts.find(p => / Shi$/.test(p) || / City$/.test(p))
          if (cityPart) {
            // "Shi Jia Zhuang Shi" → "Shijiazhuang" (Shi除去＋結合)
            const cityName = cityPart.replace(/ Shi$/, '').replace(/ City$/, '').split(' ')
              .map((w, i) => i === 0 ? w : w.toLowerCase()).join('')
            s.name = `${cityName} Station`
          }
        } catch { /* keep original */ }
      }
    }
  }

  return stations
}

/** Google Routes API でルート情報を取得（経路詳細 + 費用 + polyline） */
async function fetchRoute(origin, destination, apiKey) {
  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps.navigationInstruction,routes.legs.steps.transitDetails,routes.legs.steps.travelMode',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
        destination: { address: destination },
        travelMode: 'TRANSIT',
        languageCode: 'en',
      }),
    })
    if (!res.ok) {
      console.warn(`  [Routes API] HTTP ${res.status} for ${origin.name || 'origin'} → ${destination}`)
      return null
    }
    const data = await res.json()
    if (!data.routes?.length) {
      console.warn(`  [Routes API] No transit route: ${origin.name || 'origin'} → ${destination}`)
      return null
    }

    const route = data.routes[0]
    const durationSecs = parseInt(route.duration, 10)
    const h = Math.floor(durationSecs / 3600)
    const m = Math.floor((durationSecs % 3600) / 60)
    const timeStr = h > 0 ? `${h}h${m > 0 ? ` ${m}min` : ''}` : `${m}min`
    const polyline = route.polyline?.encodedPolyline || null

    // 経路詳細を抽出（Transit steps）
    const leg = route.legs?.[0]
    // Transit stepsのみ抽出（道順の細かい指示は除外）
    const steps = (leg?.steps || [])
      .filter(s => s.transitDetails)
      .map((s, i) => {
        const td = s.transitDetails
        const line = td.transitLine?.nameShort || td.transitLine?.name || ''
        const vehicle = td.transitLine?.vehicle?.type || s.travelMode || ''
        const from = td.stopDetails?.departureStop?.name || ''
        const to = td.stopDetails?.arrivalStop?.name || ''
        const segment = from && to ? `${from} → ${to}` : from || to
        return `${i + 1}. ${[vehicle, line, segment].filter(Boolean).join(' ')}`
      })
      .filter(Boolean)
    const routeDetail = steps.join('\n') || null

    // 費用（transit fare）
    // Routes API v2 doesn't return fare info directly; we'll estimate based on transit type
    // For now, set cost to null (to be improved later)
    const cost = null

    return { time: timeStr, routeDetail, cost, polyline }
  } catch (e) {
    console.warn(`  [Routes API] Error: ${origin.name || 'origin'} → ${destination}: ${e.message?.slice(0, 80)}`)
    return null
  }
}

/** システムプロンプト（キャッシュ対応） */
const COST_ESTIMATE_SYSTEM_PROMPT = `You are an expert at estimating public transit and transportation costs worldwide.
Provide cost estimates in ISO currency code format (e.g., "~30 USD", "~3000 JPY").
Be concise and reply with amount and currency code only.`

const TRANSIT_ESTIMATE_SYSTEM_PROMPT = `You are an expert at estimating public transit routes and costs worldwide.
Provide route information in JSON format with time, route details, and cost.
Use ISO currency codes. If no public transit exists, return null values.`

const TAXI_ESTIMATE_SYSTEM_PROMPT = `You are an expert at estimating taxi/rideshare costs worldwide.
Provide cost estimates in ISO currency code format (e.g., "~50 USD", "~40 EUR").
Be concise and reply with amount and currency code only.`

const VENUE_ACCESS_SYSTEM_PROMPT = `You are an expert at providing airport, station, and venue access information worldwide.
Extract access information in JSON format with airport names, distances, and travel times.`

/** LLM で経路の費用を推定（ISO通貨コード付き） */
async function estimateCostWithLlm(anthropic, fromName, toLocation, routeDetail, country) {
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 20,
      system: [{ type: 'text', text: COST_ESTIMATE_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: `Estimate one-way public transit cost: "${fromName}" → "${toLocation}" in ${country || 'unknown country'}. Route: ${routeDetail || 'unknown'}. Reply with ONLY the amount and ISO currency code like "~30 USD" or "~25 EUR" or "~3000 JPY". No symbols, no explanation. If unknown: "null"`,
      }],
    })
    const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
    if (!text || text === 'null' || text === 'unknown' || text.length > 20) return null
    return text
  } catch {
    return null
  }
}

/** LLM で空港/駅→会場の公共交通ルートを推定（Google Transit API未対応地域用） */
async function estimateTransitWithLlm(anthropic, fromName, toLocation, country) {
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: [{ type: 'text', text: TRANSIT_ESTIMATE_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: `Public transit route from "${fromName}" to "${toLocation}" in ${country || 'unknown'}. Reply in JSON: {"time":"~1h 30min","route":"1. Take X line to Y\\n2. Transfer to Z","cost":"~1500 JPY"}. Use ISO currency code. If no public transit exists, return {"time":null,"route":null,"cost":null}. JSON only.`,
      }],
    })
    const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

/** LLM でタクシーコストを推定（公共交通なしの場合） */
async function estimateTaxiCostWithLlm(anthropic, fromName, toLocation, distanceKm, country) {
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 20,
      system: [{ type: 'text', text: TAXI_ESTIMATE_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: `Estimate one-way taxi cost: "${fromName}" → "${toLocation}" in ${country || 'unknown country'} (approx ${Math.round(distanceKm)}km). Reply with ONLY the amount and ISO currency code like "~50 USD" or "~40 EUR". No symbols, no explanation. If unknown: "null"`,
      }],
    })
    const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
    if (!text || text === 'null' || text === 'unknown' || text.length > 20) return null
    return text
  } catch {
    return null
  }
}

// --- LLM フォールバック ---

/** LLM で空港・駅情報を取得（Google API 失敗時のフォールバック） */
async function fetchVenueAccessWithLlm(anthropic, location, country) {
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    system: [{ type: 'text', text: VENUE_ACCESS_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: `For "${location}" (${country || 'unknown'}), list the 2 nearest airports and 1 nearest train station.
Return JSON only:
{
  "airport_1_name": "Name (CODE)",
  "airport_1_distance_km": number,
  "airport_1_access": "transport mode and time",
  "airport_2_name": "Name (CODE)",
  "airport_2_distance_km": number,
  "airport_2_access": "transport mode and time",
  "station_name": "Station Name",
  "station_distance_km": number,
  "station_access": "transport mode and time"
}
JSON only.`,
    }],
  })
  const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  return JSON.parse(jsonMatch[0])
}

// --- メイン ---

/**
 * 単一イベントの英語版ロジ情報をエンリッチする
 */
export async function enrichLogiEn(event, opts = { dryRun: false, force: false }) {
  const { dryRun = false, force = false } = opts
  const apiKey = process.env.GOOGLE_DIRECTIONS_API_KEY
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })

  try {
    await client.connect()
    const { id: eventId, name, location, country } = event
    const isJapan = !country || country === '日本' || country.toLowerCase() === 'japan'

    if (!location) {
      return { success: false, eventId, error: 'no location' }
    }

    // 既存チェック
    const existing = await client.query(
      `SELECT id FROM ${SCHEMA}.access_routes WHERE event_id = $1 AND origin_type = 'venue_access'`,
      [eventId]
    )
    if (existing.rows.length > 0 && !force) {
      return { success: true, eventId } // 既にあればスキップ（forceでない場合）
    }
    // force時は既存データを削除して再取得
    if (existing.rows.length > 0 && force) {
      await client.query(`DELETE FROM ${SCHEMA}.access_routes WHERE event_id = $1 AND origin_type = 'venue_access'`, [eventId])
    }

    let result = null
    // Coordinates and polylines from Google API (not available from LLM)
    let airport1Coords = null
    let airport1Polyline = null
    let airport2Coords = null
    let airport2Polyline = null
    let stationCoords = null
    let stationPolyline = null

    // Google API で取得を試みる
    if (apiKey) {
      try {
        const airports = await searchNearbyAirports(location, apiKey)
        const stations = await searchNearbyStations(location, apiKey)

        if (airports.length > 0 || stations.length > 0) {
          result = {}

          const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

          // ルート取得のヘルパー: Google API → LLMフォールバック（日本） or タクシー（海外）
          const getRouteInfo = async (point, label) => {
            // 徒歩圏内（1km未満）
            if (point.distance_km < 1) {
              return { access: `Walk ~${Math.round(point.distance_km * 1000)}m`, cost: null, polyline: null }
            }
            const route = isJapan ? null : await fetchRoute(point, location, apiKey)
            if (route && route.routeDetail) {
              return {
                access: `${route.time}\n${route.routeDetail}`,
                cost: await estimateCostWithLlm(anthropic, point.name, location, route.routeDetail, country),
                polyline: route.polyline || null,
              }
            }
            // Google APIでルート詳細が取れなかった or 日本（Transit API未対応）→ LLMフォールバック
            {
              const llm = await estimateTransitWithLlm(anthropic, point.name, location, country)
              if (llm?.route) {
                return { access: `${llm.time || ''}\n${llm.route}`, cost: llm.cost || null, polyline: null }
              }
            }
            // 公共交通なし → タクシー
            return {
              access: `Taxi ~${Math.round(point.distance_km)}km`,
              cost: await estimateTaxiCostWithLlm(anthropic, point.name, location, point.distance_km, country),
              polyline: null,
            }
          }

          // 空港1
          if (airports[0]) {
            const info = await getRouteInfo(airports[0], 'airport_1')
            result.airport_1_name = airports[0].name
            result.airport_1_lat = airports[0].lat
            result.airport_1_lng = airports[0].lng
            result.airport_1_access = info.access
            result.airport_1_cost = info.cost
            airport1Coords = { lat: airports[0].lat, lng: airports[0].lng }
            airport1Polyline = info.polyline
          }
          // 空港2
          if (airports[1]) {
            const info = await getRouteInfo(airports[1], 'airport_2')
            result.airport_2_name = airports[1].name
            result.airport_2_lat = airports[1].lat
            result.airport_2_lng = airports[1].lng
            result.airport_2_access = info.access
            result.airport_2_cost = info.cost
            airport2Coords = { lat: airports[1].lat, lng: airports[1].lng }
            airport2Polyline = info.polyline
          }
          // 駅
          if (stations[0]) {
            const info = await getRouteInfo(stations[0], 'station')
            result.station_name = stations[0].name
            result.station_lat = stations[0].lat
            result.station_lng = stations[0].lng
            result.station_access = info.access
            result.station_cost = info.cost
            stationCoords = { lat: stations[0].lat, lng: stations[0].lng }
            stationPolyline = info.polyline
          }
        }
      } catch (e) {
        console.warn(`  [Google API] ${e.message?.slice(0, 60)}, falling back to LLM`)
      }
    }

    // LLM フォールバック
    if (!result) {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      result = await fetchVenueAccessWithLlm(anthropic, location, country)
    }

    if (!result) {
      return { success: false, eventId, error: 'no access info obtained' }
    }

    if (dryRun) {
      console.log(`  DRY enrichLogi-en: ${name?.slice(0, 40)} | airport1: ${result.airport_1_name || '?'} | station: ${result.station_name || '?'}`)
      return { success: true, eventId }
    }

    // DB保存: route_detail_en に構造化JSONを保存
    // Use airport_1 coordinates as primary lat/lng for the access_routes record
    const primaryCoords = airport1Coords || stationCoords
    const accessData = JSON.stringify(result)
    // Combine all polylines into a single JSON array for route_polyline
    const polylines = [airport1Polyline, airport2Polyline, stationPolyline].filter(Boolean)
    const routePolyline = polylines.length > 0 ? JSON.stringify(polylines) : null

    await client.query(
      `INSERT INTO ${SCHEMA}.access_routes
        (event_id, direction, origin_type, route_detail_en, latitude, longitude, route_polyline)
       VALUES ($1, 'access', 'venue_access', $2, $3, $4, $5)`,
      [eventId, accessData, primaryCoords?.lat || null, primaryCoords?.lng || null, routePolyline]
    )

    return { success: true, eventId }
  } catch (e) {
    return { success: false, eventId: event.id, error: e.message }
  } finally {
    try { await client.end() } catch { /* ignore */ }
  }
}

// --- CLI ---

async function runCli() {
  const args = process.argv.slice(2)
  const DRY_RUN = args.includes('--dry-run')
  const FORCE = args.includes('--force')
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
  } else if (FORCE) {
    // --force: 既存データありでも全件対象
    const { rows } = await client.query(
      `SELECT e.id, e.name, e.location, e.country
       FROM ${SCHEMA}.events e
       WHERE e.location IS NOT NULL AND e.collected_at IS NOT NULL
         AND e.latitude IS NOT NULL
         AND EXISTS (SELECT 1 FROM ${SCHEMA}.categories c WHERE c.event_id = e.id)
       ORDER BY e.updated_at ASC
       LIMIT $1`,
      [LIMIT === Infinity ? 10000 : LIMIT]
    )
    targets = rows
  } else {
    const { rows } = await client.query(
      `SELECT e.id, e.name, e.location, e.country
       FROM ${SCHEMA}.events e
       LEFT JOIN ${SCHEMA}.access_routes ar ON ar.event_id = e.id AND ar.origin_type = 'venue_access'
       WHERE e.location IS NOT NULL AND e.collected_at IS NOT NULL AND ar.id IS NULL
         AND e.latitude IS NOT NULL
         AND EXISTS (SELECT 1 FROM ${SCHEMA}.categories c WHERE c.event_id = e.id)
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

    const result = await enrichLogiEn(event, { dryRun: DRY_RUN, force: FORCE })
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

// --- Batch CLI ---

/**
 * バッチAPI対応CLIモード
 * --batch フラグで起動時、複数イベントを蓄積してバッチ送信
 */
async function runBatchCli() {
  const args = process.argv.slice(2)
  const DRY_RUN = args.includes('--dry-run')
  const FORCE = args.includes('--force')
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
  } else if (FORCE) {
    const { rows } = await client.query(
      `SELECT e.id, e.name, e.location, e.country
       FROM ${SCHEMA}.events e
       WHERE e.location IS NOT NULL AND e.collected_at IS NOT NULL
         AND e.latitude IS NOT NULL
         AND EXISTS (SELECT 1 FROM ${SCHEMA}.categories c WHERE c.event_id = e.id)
       ORDER BY e.updated_at ASC
       LIMIT $1`,
      [LIMIT === Infinity ? 10000 : LIMIT]
    )
    targets = rows
  } else {
    const { rows } = await client.query(
      `SELECT e.id, e.name, e.location, e.country
       FROM ${SCHEMA}.events e
       LEFT JOIN ${SCHEMA}.access_routes ar ON ar.event_id = e.id AND ar.origin_type = 'venue_access'
       WHERE e.location IS NOT NULL AND e.collected_at IS NOT NULL AND ar.id IS NULL
         AND e.latitude IS NOT NULL
         AND EXISTS (SELECT 1 FROM ${SCHEMA}.categories c WHERE c.event_id = e.id)
       ORDER BY e.updated_at ASC
       LIMIT $1`,
      [LIMIT === Infinity ? 10000 : LIMIT]
    )
    targets = rows
  }

  await client.end()

  console.log(`=== ロジエンリッチ（英語版）バッチモード開始 (DRY_RUN: ${DRY_RUN}, 件数: ${targets.length}) ===\n`)

  if (targets.length === 0) {
    console.log('対象イベントなし')
    return
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const apiKey = process.env.GOOGLE_DIRECTIONS_API_KEY

  // --- パス1: Google API 試行 + バッチリクエスト構築 ---
  const batchRequests = []
  const eventContext = new Map()  // eventId → context info

  for (const event of targets) {
    const { id: eventId, name, location, country } = event
    if (!location) continue

    const isJapan = !country || country === '日本' || country.toLowerCase() === 'japan'
    const ctx = { event, isJapan, googleSuccess: true, google_airports: [], google_stations: [] }
    eventContext.set(eventId, ctx)

    // Google API で基本情報を取得
    if (apiKey) {
      try {
        const airports = await searchNearbyAirports(location, apiKey)
        const stations = await searchNearbyStations(location, apiKey)

        if (airports.length > 0 || stations.length > 0) {
          ctx.google_airports = airports
          ctx.google_stations = stations
        } else {
          ctx.googleSuccess = false
        }
      } catch {
        ctx.googleSuccess = false
      }
    } else {
      ctx.googleSuccess = false
    }

    // Google API が失敗 or 結果なし → LLM フォールバック用バッチリクエストを追加
    if (!ctx.googleSuccess) {
      batchRequests.push({
        custom_id: `venue_access_${eventId}`,
        systemPrompt: VENUE_ACCESS_SYSTEM_PROMPT,
        userContent: `For "${location}" (${country || 'unknown'}), list the 2 nearest airports and 1 nearest train station.
Return JSON only:
{
  "airport_1_name": "Name (CODE)",
  "airport_1_distance_km": number,
  "airport_1_access": "transport mode and time",
  "airport_2_name": "Name (CODE)",
  "airport_2_distance_km": number,
  "airport_2_access": "transport mode and time",
  "station_name": "Station Name",
  "station_distance_km": number,
  "station_access": "transport mode and time"
}
JSON only.`,
        maxTokens: 500,
      })
    }
  }

  // バッチリクエスト内での各要素の cost/route 推定は仕訳が複雑なため、同期処理で実行
  // （複数リクエストが互いに依存するため）

  console.log(`[batch] ${batchRequests.length} 件のLLMリクエストをバッチ送信\n`)

  // --- パス2: バッチ送信 + 待機 ---
  let batchResults = new Map()
  if (batchRequests.length > 0 && !DRY_RUN) {
    batchResults = await runBatch(anthropic, batchRequests)
  } else if (DRY_RUN) {
    console.log(`[batch] DRY_RUN: バッチ送信スキップ`)
  }

  // --- パス3: 結果処理 + DB 書き込み ---
  const dbClient = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await dbClient.connect()

  let ok = 0, errors = 0

  for (const [eventId, ctx] of eventContext) {
    const { event, isJapan, googleSuccess, google_airports: airports, google_stations: stations } = ctx
    const { name, location, country } = event

    if (DRY_RUN) {
      console.log(`  DRY (batch) ${name?.slice(0, 40)} | google: ${googleSuccess} | airports: ${airports.length}, stations: ${stations.length}`)
      ok++
      continue
    }

    try {
      let result = null

      // Google API 成功時
      if (googleSuccess && (airports.length > 0 || stations.length > 0)) {
        result = {}

        // このループ内で cost/route を同期的に推定（依存関係があるため）
        const getRouteInfo = async (point, label) => {
          if (point.distance_km < 1) {
            return { access: `Walk ~${Math.round(point.distance_km * 1000)}m`, cost: null, polyline: null }
          }
          const route = isJapan ? null : await fetchRoute(point, location, apiKey)
          if (route && route.routeDetail) {
            return {
              access: `${route.time}\n${route.routeDetail}`,
              cost: await estimateCostWithLlm(anthropic, point.name, location, route.routeDetail, country),
              polyline: route.polyline || null,
            }
          }
          {
            const llm = await estimateTransitWithLlm(anthropic, point.name, location, country)
            if (llm?.route) {
              return { access: `${llm.time || ''}\n${llm.route}`, cost: llm.cost || null, polyline: null }
            }
          }
          return {
            access: `Taxi ~${Math.round(point.distance_km)}km`,
            cost: await estimateTaxiCostWithLlm(anthropic, point.name, location, point.distance_km, country),
            polyline: null,
          }
        }

        let airport1Coords = null, airport1Polyline = null
        let airport2Coords = null, airport2Polyline = null
        let stationCoords = null, stationPolyline = null

        if (airports[0]) {
          const info = await getRouteInfo(airports[0], 'airport_1')
          result.airport_1_name = airports[0].name
          result.airport_1_lat = airports[0].lat
          result.airport_1_lng = airports[0].lng
          result.airport_1_access = info.access
          result.airport_1_cost = info.cost
          airport1Coords = { lat: airports[0].lat, lng: airports[0].lng }
          airport1Polyline = info.polyline
        }
        if (airports[1]) {
          const info = await getRouteInfo(airports[1], 'airport_2')
          result.airport_2_name = airports[1].name
          result.airport_2_lat = airports[1].lat
          result.airport_2_lng = airports[1].lng
          result.airport_2_access = info.access
          result.airport_2_cost = info.cost
          airport2Coords = { lat: airports[1].lat, lng: airports[1].lng }
          airport2Polyline = info.polyline
        }
        if (stations[0]) {
          const info = await getRouteInfo(stations[0], 'station')
          result.station_name = stations[0].name
          result.station_lat = stations[0].lat
          result.station_lng = stations[0].lng
          result.station_access = info.access
          result.station_cost = info.cost
          stationCoords = { lat: stations[0].lat, lng: stations[0].lng }
          stationPolyline = info.polyline
        }

        const primaryCoords = airport1Coords || stationCoords
        const polylines = [airport1Polyline, airport2Polyline, stationPolyline].filter(Boolean)
        const routePolyline = polylines.length > 0 ? JSON.stringify(polylines) : null

        await dbClient.query(
          `INSERT INTO ${SCHEMA}.access_routes
            (event_id, direction, origin_type, route_detail_en, latitude, longitude, route_polyline)
           VALUES ($1, 'access', 'venue_access', $2, $3, $4, $5)`,
          [eventId, JSON.stringify(result), primaryCoords?.lat || null, primaryCoords?.lng || null, routePolyline]
        )
      } else {
        // LLMフォールバック: バッチ結果から取得
        const batchResult = batchResults.get(`venue_access_${eventId}`)
        if (batchResult && batchResult.success && batchResult.parsed) {
          result = batchResult.parsed
          const primaryCoords = result.airport_1_distance_km ? { lat: null, lng: null } : null  // LLMはlatitude/longitude持たない
          await dbClient.query(
            `INSERT INTO ${SCHEMA}.access_routes
              (event_id, direction, origin_type, route_detail_en, latitude, longitude, route_polyline)
             VALUES ($1, 'access', 'venue_access', $2, $3, $4, $5)`,
            [eventId, JSON.stringify(result), null, null, null]
          )
        }
      }

      ok++
      console.log(`  OK (batch) ${name?.slice(0, 40)}`)
    } catch (e) {
      errors++
      console.log(`  ERR (batch) ${name?.slice(0, 40)} | ${e.message?.slice(0, 60)}`)
    }
  }

  await dbClient.end()

  console.log(`\n=== 完了 ===`)
  console.log(`OK: ${ok}, Errors: ${errors}`)
}

if (process.argv[1]?.endsWith('enrich-logi-en.js')) {
  const useBatch = process.argv.includes('--batch')
  const runner = useBatch ? runBatchCli : runCli
  runner().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
