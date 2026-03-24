/**
 * #334 バッチ品質テストスクリプト
 * 今日の全指摘を自動検証する
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
const apiKey = process.env.GOOGLE_DIRECTIONS_API_KEY
const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

const args = process.argv.slice(2)
const limitIdx = args.indexOf('--limit')
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 10
const OFFSET_IDX = args.indexOf('--offset')
const OFFSET = OFFSET_IDX >= 0 ? parseInt(args[OFFSET_IDX + 1], 10) : 0

const { rows: events } = await client.query(`
  SELECT e.id, e.name, e.country, e.location, e.latitude, e.longitude,
    e.reception_place, e.start_place, e.collected_at,
    e.visa_info, e.visa_info_en, e.weather_forecast, e.weather_forecast_en
  FROM ${SCHEMA}.events e
  WHERE e.location IS NOT NULL AND e.collected_at IS NOT NULL
    AND (e.reception_place IS NOT NULL OR e.start_place IS NOT NULL)
  ORDER BY e.updated_at ASC
  OFFSET $1 LIMIT $2
`, [OFFSET, LIMIT])

let totalIssues = 0
let totalEvents = 0
const issuesByType = {}

function addIssue(eventName, type, detail) {
  totalIssues++
  issuesByType[type] = (issuesByType[type] || 0) + 1
  console.log(`  [!] ${type}: ${detail} [${eventName?.slice(0, 30)}]`)
}

for (const ev of events) {
  totalEvents++
  const isJapan = ev.country === '日本' || !ev.country
  const isInternational = !isJapan

  // === 1. イベント座標 ===
  if (!ev.latitude || !ev.longitude) {
    addIssue(ev.name, 'EVENT_NO_COORDS', '座標なし → 地図が表示されない')
  } else if (ev.location && apiKey) {
    try {
      const geoRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(ev.location)}&key=${apiKey}`)
      const geoData = await geoRes.json()
      if (geoData.results?.length) {
        const { lat, lng } = geoData.results[0].geometry.location
        const dist = Math.sqrt(Math.pow((ev.latitude - lat) * 111, 2) + Math.pow((ev.longitude - lng) * 111 * Math.cos(lat * Math.PI / 180), 2))
        if (dist > 100) {
          addIssue(ev.name, 'EVENT_COORDS_MISMATCH', `座標が${Math.round(dist)}km離れている`)
        }
      }
    } catch { /* ignore */ }
  }

  // === 2. VISA情報（海外イベントの日本語版に必要） ===
  if (isInternational && !ev.visa_info) {
    addIssue(ev.name, 'NO_VISA_INFO', '海外イベントにVISA情報なし')
  }

  // === 3. 天気の装備混入チェック: なしでOK（許容） ===

  // === 4. カテゴリ ===
  const { rows: cats } = await client.query(
    `SELECT count(*) as cnt FROM ${SCHEMA}.categories WHERE event_id = $1`, [ev.id]
  )
  const hasCats = parseInt(cats[0].cnt) > 0

  // === 5. tokyo route ===
  const { rows: tokyoRoutes } = await client.query(
    `SELECT direction, route_detail, shuttle_available, shuttle_available_en, taxi_estimate, transit_accessible
     FROM ${SCHEMA}.access_routes WHERE event_id = $1 AND origin_type = 'tokyo'`, [ev.id]
  )
  const outbound = tokyoRoutes.find(r => r.direction === 'outbound')
  const ret = tokyoRoutes.find(r => r.direction === 'return')

  if (!outbound) {
    addIssue(ev.name, 'NO_TOKYO_ROUTE', 'tokyo outbound route なし')
  } else {
    // sameStartGoal
    if (ret && outbound.route_detail !== ret.route_detail) {
      addIssue(ev.name, 'SAME_START_GOAL_FAIL', '往路≠復路（復路が重複表示される）')
    }
    // ルート構造化
    if (isJapan && outbound.route_detail && !outbound.route_detail.startsWith('1.')) {
      addIssue(ev.name, 'ROUTE_NOT_STRUCTURED', 'ルートが番号付きでない')
    }
    // 東京駅始点
    if (isJapan && outbound.route_detail && !outbound.route_detail.includes('東京駅')) {
      addIssue(ev.name, 'ROUTE_NOT_FROM_TOKYO', '東京駅が含まれない')
    }
    // シャトル非公式
    if (outbound.shuttle_available) {
      const isOfficial = outbound.shuttle_available.includes('シャトルバス') || outbound.shuttle_available.length > 30
      if (!isOfficial) {
        addIssue(ev.name, 'SHUTTLE_NOT_OFFICIAL', 'シャトル情報が公式以外: ' + outbound.shuttle_available.slice(0, 40))
      }
    }
    // シャトルあるのに英語版にない
    if (outbound.shuttle_available && !outbound.shuttle_available_en) {
      addIssue(ev.name, 'SHUTTLE_NO_EN', 'シャトル情報の英語版なし')
    }
    // costToUsd変換テスト（範囲テキストのパース）
    if (outbound.cost_estimate) {
      const match = outbound.cost_estimate.match(/[\d,]+/)
      if (match) {
        const yen = parseInt(match[0].replace(/,/g, ''), 10)
        const usd = Math.round(yen / 150)
        if (usd > 100000) {
          addIssue(ev.name, 'COST_PARSE_ERROR', `コスト変換異常: ${outbound.cost_estimate} → $${usd}`)
        }
      }
    }
  }

  // === 6. venue_access（カテゴリありの場合） ===
  if (hasCats) {
    const { rows: vaRoutes } = await client.query(
      `SELECT route_detail_en FROM ${SCHEMA}.access_routes WHERE event_id = $1 AND origin_type = 'venue_access'`, [ev.id]
    )
    if (vaRoutes.length === 0) {
      addIssue(ev.name, 'NO_VENUE_ACCESS', 'venue_access なし')
    } else {
      try {
        const d = JSON.parse(vaRoutes[0].route_detail_en)
        if (d.airport_1_name && !d.airport_1_lat) {
          addIssue(ev.name, 'VA_NO_LAT', 'airport_1のlat/lngなし')
        }
        for (const k of ['airport_1_cost', 'airport_2_cost', 'station_cost']) {
          if (d[k] && !/[A-Z]{3}/.test(d[k])) {
            addIssue(ev.name, 'VA_NO_ISO_CURRENCY', `${k}にISO通貨コードなし: ${d[k]}`)
          }
        }
        const allTaxi = [d.airport_1_access, d.airport_2_access, d.station_access]
          .filter(Boolean)
          .every(a => a.startsWith('Taxi') || a.startsWith('Walk'))
        if (isJapan && allTaxi) {
          addIssue(ev.name, 'VA_JAPAN_ALL_TAXI', '日本なのに全ルートがタクシー/徒歩のみ')
        }
        for (const [key, label] of [['airport_1_access','ap1'],['airport_2_access','ap2'],['station_access','stn']]) {
          const val = d[key]
          if (val && !val.startsWith('Taxi') && !val.startsWith('Walk') && !val.includes('\n') && !val.includes('.')) {
            addIssue(ev.name, 'VA_ACCESS_NO_DETAIL', `${label}に時間のみでルート詳細なし: ${val}`)
          }
        }
      } catch {
        addIssue(ev.name, 'VA_PARSE_ERROR', 'route_detail_en がJSON解析不可')
      }
    }
  }

  // === 7. 宿泊 ===
  const { rows: accoms } = await client.query(
    `SELECT recommended_area, latitude, longitude, avg_cost_3star FROM ${SCHEMA}.accommodations WHERE event_id = $1`, [ev.id]
  )
  if (accoms.length === 0) {
    addIssue(ev.name, 'NO_ACCOMMODATION', '宿泊データなし')
  } else {
    for (const a of accoms) {
      if (!a.latitude || !a.longitude) {
        addIssue(ev.name, 'ACCOM_NO_COORDS', '宿泊座標なし → マーカー表示されない')
      }
      if (a.avg_cost_3star != null && a.avg_cost_3star < 1000) {
        addIssue(ev.name, 'ACCOM_COST_LOW', `宿泊費異常値: ${a.avg_cost_3star}円`)
      }
      // 会場と宿泊が同じ座標 → 会場近くに宿泊するケースもあるので許容
    }
  }
}

// サマリー
console.log('\n========================================')
console.log(`テスト完了: ${totalEvents}件中 ${totalIssues}件の問題`)
console.log('========================================')
if (Object.keys(issuesByType).length > 0) {
  console.log('\n問題の内訳:')
  for (const [type, count] of Object.entries(issuesByType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}件`)
  }
}
console.log('')

await client.end()
