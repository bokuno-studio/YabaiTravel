/**
 * #334 バッチ品質テストスクリプト
 * 全ての既知の問題を自動検証する
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
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 10
const OFFSET_IDX = args.indexOf('--offset')
const OFFSET = OFFSET_IDX >= 0 ? parseInt(args[OFFSET_IDX + 1], 10) : 0

// テスト対象イベントを取得
const { rows: events } = await client.query(`
  SELECT e.id, e.name, e.country, e.location, e.latitude, e.longitude,
    e.reception_place, e.start_place, e.collected_at
  FROM ${SCHEMA}.events e
  WHERE e.location IS NOT NULL AND e.collected_at IS NOT NULL
  ORDER BY e.updated_at ASC
  OFFSET $1 LIMIT $2
`, [OFFSET, LIMIT])

let totalIssues = 0
let totalEvents = 0
const issuesByType = {}

function addIssue(eventName, type, detail) {
  totalIssues++
  issuesByType[type] = (issuesByType[type] || 0) + 1
  console.log(`  [!] ${type}: ${detail}`)
}

for (const ev of events) {
  totalEvents++
  const isJapan = ev.country === '日本' || !ev.country
  const issues = []

  // 1. イベント座標チェック
  if (!ev.latitude || !ev.longitude) {
    addIssue(ev.name, 'EVENT_NO_COORDS', '座標なし → 地図が表示されない')
  }

  // 2. カテゴリチェック
  const { rows: cats } = await client.query(
    `SELECT count(*) as cnt FROM ${SCHEMA}.categories WHERE event_id = $1`, [ev.id]
  )
  const hasCats = parseInt(cats[0].cnt) > 0
  const { rows: enrichedCats } = await client.query(
    `SELECT count(*) as cnt FROM ${SCHEMA}.categories WHERE event_id = $1 AND distance_km IS NOT NULL`, [ev.id]
  )
  const hasEnrichedCats = parseInt(enrichedCats[0].cnt) > 0

  // 3. tokyo route チェック
  const { rows: tokyoRoutes } = await client.query(
    `SELECT direction, route_detail, shuttle_available, taxi_estimate, transit_accessible, route_polyline IS NOT NULL as has_polyline
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
      addIssue(ev.name, 'ROUTE_NOT_STRUCTURED', 'ルートが番号付きでない: ' + outbound.route_detail.slice(0, 40))
    }
    // 東京駅始点
    if (isJapan && outbound.route_detail && !outbound.route_detail.includes('東京駅')) {
      addIssue(ev.name, 'ROUTE_NOT_FROM_TOKYO', '東京駅が含まれない: ' + outbound.route_detail.slice(0, 40))
    }
    // シャトル
    if (outbound.shuttle_available) {
      // 公式サイト由来か確認（長文 or キーワードあり = OK）
      const isOfficial = outbound.shuttle_available.includes('シャトルバス') || outbound.shuttle_available.length > 30
      if (!isOfficial) {
        addIssue(ev.name, 'SHUTTLE_NOT_OFFICIAL', 'シャトル情報が公式以外: ' + outbound.shuttle_available.slice(0, 40))
      }
    }
    // タクシー（transit_accessible が文字列 'full' の場合のみ不要。boolean true はfull/partial両方含む）
    // partialでタクシー情報があるのは正常
  }

  // 4. venue_access チェック（カテゴリありの場合のみ）
  if (hasCats) {
    const { rows: vaRoutes } = await client.query(
      `SELECT route_detail_en FROM ${SCHEMA}.access_routes WHERE event_id = $1 AND origin_type = 'venue_access'`, [ev.id]
    )
    if (vaRoutes.length === 0) {
      addIssue(ev.name, 'NO_VENUE_ACCESS', 'venue_access なし')
    } else {
      try {
        const d = JSON.parse(vaRoutes[0].route_detail_en)
        // lat/lng
        if (d.airport_1_name && !d.airport_1_lat) {
          addIssue(ev.name, 'VA_NO_LAT', 'airport_1のlat/lngなし')
        }
        // 通貨コード
        for (const k of ['airport_1_cost', 'airport_2_cost', 'station_cost']) {
          if (d[k] && !/[A-Z]{3}/.test(d[k])) {
            addIssue(ev.name, 'VA_NO_ISO_CURRENCY', `${k}にISO通貨コードなし: ${d[k]}`)
          }
        }
        // 日本でタクシー表示
        if (isJapan && d.airport_1_access?.startsWith('Taxi')) {
          addIssue(ev.name, 'VA_JAPAN_TAXI', '日本なのにタクシー表示（LLMフォールバック未適用）')
        }
      } catch {
        addIssue(ev.name, 'VA_PARSE_ERROR', 'route_detail_en がJSON解析不可')
      }
    }
  }

  // 5. 宿泊チェック
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
    }
  }

  // イベント結果出力
  const eventIssueCount = totalIssues - (totalEvents > 1 ? 0 : 0) // simplified
  if (issues.length === 0) {
    // 問題なしの場合は1行で
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

await client.end()
