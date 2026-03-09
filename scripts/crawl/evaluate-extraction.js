/**
 * DB の全 events を読み、各 official_url の詳細ページを fetch して期待項目を抽出し、
 * 実際の DB 値と比較。結果を evaluation-result.json に出力
 *
 * 使い方: node scripts/crawl/evaluate-extraction.js
 */
import pg from 'pg'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import * as cheerio from 'cheerio'
import { extract as extractAExtremoDetail } from '../crawl-extract/extract-a-extremo-detail.js'

const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8')
    .split('\n')
    .forEach((line) => {
      const m = line.match(/^([^#=]+)=(.*)$/)
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
    })
}

/** 期待される events 項目（SPEC_RACE_DATA, SPEC_DATA_STRUCTURE 参照） */
const EXPECTED_EVENT_FIELDS = [
  'name',
  'event_date',
  'location',
  'official_url',
  'entry_url',
  'race_type',
  'participant_count',
  'entry_start',
  'entry_end',
  'reception_place',
  'start_place',
  'prohibited_items',
  'country',
  'total_cost_estimate',
]

/** 期待される categories 項目 */
const EXPECTED_CATEGORY_FIELDS = [
  'name',
  'elevation_gain',
  'distance_km',
  'entry_fee',
  'start_time',
  'time_limit',
  'mandatory_gear',
]

/** 期待される access_routes 項目 */
const EXPECTED_ACCESS_FIELDS = ['direction', 'route_detail', 'total_time_estimate', 'cost_estimate']

/** 期待される accommodations 項目 */
const EXPECTED_ACCOMMODATION_FIELDS = ['recommended_area', 'avg_cost_3star']

async function fetchHtml(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'YabaiTravel-Crawl/1.0 (evaluation)' },
    redirect: 'follow',
    ...opts,
  })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.text()
}

/** URL からソース種別を判定 */
function getSourceType(url) {
  if (!url) return 'generic'
  if (url.includes('a-extremo.com')) return 'a-extremo'
  if (url.includes('goldentrailseries.com')) return 'golden-trail'
  if (url.includes('utmb.world')) return 'utmb'
  if (url.includes('hyrox.com')) return 'hyrox'
  if (url.includes('spartan.com')) return 'spartan'
  if (url.includes('toughmudder.com')) return 'tough-mudder'
  if (url.includes('strongviking.com')) return 'strong-viking'
  if (url.includes('devilscircuit.com')) return 'devils-circuit'
  if (url.includes('runnet.jp')) return 'runnet'
  if (url.includes('sportsentry.ne.jp')) return 'sports-entry'
  if (url.includes('do.l-tike.com')) return 'lawson-do'
  if (url.includes('albatros-adventure-marathons.com')) return 'albatros'
  if (url.includes('ahotu.com')) return 'ahotu'
  if (url.includes('itra.run')) return 'itra'
  return 'generic'
}

/**
 * 汎用: HTML から期待項目を抽出（共通パターンを試行）
 * @returns {Record<string, unknown>}
 */
function extractGenericDetail(html) {
  const $ = cheerio.load(html)
  const out = {}

  // 日付: YYYY-MM-DD, YYYY年MM月DD日, DD/MM/YYYY 等
  const datePatterns = [
    /\d{4}-\d{2}-\d{2}/,
    /(\d{4})年(\d{1,2})月(\d{1,2})日/,
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
    /([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/,
  ]
  $('body').text().replace(/\s+/g, ' ').replace(/[\r\n]/g, ' ')
  const bodyText = $('body').text()
  for (const p of datePatterns) {
    const m = bodyText.match(p)
    if (m) {
      out.event_date = m[0]
      break
    }
  }

  // 参加費・エントリー費用: 円, USD, EUR
  const feeMatch = bodyText.match(/(\d{1,3}(?:,\d{3})*)\s*円|(\$\d+(?:\.\d+)?)|(\d+)\s*(?:USD|EUR)/)
  if (feeMatch) out.entry_fee = feeMatch[0]

  // 距離: km
  const distMatch = bodyText.match(/(\d+(?:\.\d+)?)\s*km/)
  if (distMatch) out.distance_km = parseFloat(distMatch[1])

  // 獲得標高: m
  const elevMatch = bodyText.match(/(\d{1,5})\s*m\s*(?:D\+|gain|標高|累積)/i) || bodyText.match(/D\+\s*(\d{1,5})/i)
  if (elevMatch) out.elevation_gain = parseInt(elevMatch[1], 10)

  // 経路・交通: 電車, 車, アクセス, route, access 等を含むブロック
  const routeBlocks = []
  $('p, div, section').each((_, el) => {
    const t = $(el).text().trim()
    if (
      (t.includes('電車') || t.includes('車') || t.includes('アクセス') || t.includes('route') || t.includes('access')) &&
      t.length > 20 &&
      t.length < 2000
    ) {
      routeBlocks.push(t.slice(0, 500))
    }
  })
  if (routeBlocks.length) out.route_detail = routeBlocks.slice(0, 2).join('\n---\n')

  return out
}

/**
 * ソース別に詳細ページから期待項目を抽出
 * @param {string} html
 * @param {string} sourceType
 * @returns {{ events: Record<string, unknown>, categories: Array<Record<string, unknown>>, access_routes: Array<Record<string, unknown>>, accommodations: Array<Record<string, unknown>> }}
 */
function extractDetailBySource(html, sourceType) {
  const result = {
    events: {},
    categories: [],
    access_routes: [],
    accommodations: [],
  }

  if (sourceType === 'a-extremo') {
    const d = extractAExtremoDetail(html)
    const cat = {}
    if (d.distance_km != null) cat.distance_km = d.distance_km
    if (d.entry_fee != null) cat.entry_fee = d.entry_fee
    if (Object.keys(cat).length) result.categories.push(cat)
    if (d.route_detail) result.access_routes.push({ direction: 'outbound', route_detail: d.route_detail })
  }

  // 汎用パターンで補完
  const generic = extractGenericDetail(html)
  for (const [k, v] of Object.entries(generic)) {
    if (v != null && v !== '') {
      if (['distance_km', 'entry_fee', 'elevation_gain'].includes(k)) {
        if (result.categories.length === 0) result.categories.push({})
        result.categories[0][k] = v
      } else if (k === 'route_detail') {
        if (result.access_routes.length === 0) result.access_routes.push({ direction: 'outbound' })
        result.access_routes[0].route_detail = v
      } else {
        result.events[k] = v
      }
    }
  }

  return result
}

/** DB の行を期待項目の有無で評価 */
function evaluateRow(row, expectedFields) {
  const filled = []
  const missing = []
  for (const f of expectedFields) {
    const v = row[f]
    if (v != null && v !== '' && String(v).trim() !== '') {
      filled.push(f)
    } else {
      missing.push(f)
    }
  }
  return { filled, missing }
}

async function run() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL が未設定です。.env.local を確認してください。')
    process.exit(1)
  }

  const client = new pg.Client({ connectionString: databaseUrl })
  await client.connect()

  const events = await client.query(`
    SELECT id, name, event_date, location, official_url, entry_url, race_type,
           participant_count, entry_start, entry_end, reception_place, start_place,
           prohibited_items, country, total_cost_estimate
    FROM yabai_travel.events
    ORDER BY event_date ASC NULLS LAST
  `)

  const evaluation = {
    evaluated_at: new Date().toISOString(),
    total_events: events.rows.length,
    events_with_url: events.rows.filter((r) => r.official_url).length,
    events_without_url: events.rows.filter((r) => !r.official_url).length,
    summary: {
      event_fields: { filled: 0, missing: 0, by_field: {} },
      categories_count: 0,
      access_routes_count: 0,
      accommodations_count: 0,
    },
    results: [],
    junk_candidates: [],
  }

  // 期待項目ごとの集計初期化
  for (const f of EXPECTED_EVENT_FIELDS) {
    evaluation.summary.event_fields.by_field[f] = { filled: 0, missing: 0 }
  }

  for (let i = 0; i < events.rows.length; i++) {
    const row = events.rows[i]
    const ev = {
      id: row.id,
      name: row.name,
      official_url: row.official_url,
      source_type: getSourceType(row.official_url),
      db: {
        events: { ...row },
        categories: [],
        access_routes: [],
        accommodations: [],
      },
      extracted: { events: {}, categories: [], access_routes: [], accommodations: [] },
      gap: { events: { filled: [], missing: [] }, categories: [], access_routes: [], accommodations: [] },
      fetch_error: null,
    }

    // DB の categories, access_routes, accommodations を取得（順次実行で pg 非推奨警告を回避）
    const catRes = await client.query('SELECT * FROM yabai_travel.categories WHERE event_id = $1', [row.id])
    const accRes = await client.query('SELECT * FROM yabai_travel.access_routes WHERE event_id = $1', [row.id])
    const accomRes = await client.query('SELECT * FROM yabai_travel.accommodations WHERE event_id = $1', [row.id])
    ev.db.categories = catRes.rows
    ev.db.access_routes = accRes.rows
    ev.db.accommodations = accomRes.rows

    // ゴミデータ候補: event_date 2099, 短すぎる名前, 怪しい名前
    if (row.event_date && String(row.event_date).startsWith('2099')) {
      evaluation.junk_candidates.push({ id: row.id, name: row.name, reason: 'event_date 2099' })
    }
    if (row.name && row.name.length < 5) {
      evaluation.junk_candidates.push({ id: row.id, name: row.name, reason: 'name too short' })
    }
    if (
      row.name &&
      /^(エントリー|プレスリリース|TICKET PRICES|DC Dubai|Sign in|shopping_cart)/i.test(row.name)
    ) {
      evaluation.junk_candidates.push({ id: row.id, name: row.name, reason: 'junk name pattern' })
    }

    // events の期待項目評価
    const eventEval = evaluateRow(row, EXPECTED_EVENT_FIELDS)
    ev.gap.events = eventEval
    for (const f of eventEval.filled) {
      evaluation.summary.event_fields.by_field[f].filled++
    }
    for (const f of eventEval.missing) {
      evaluation.summary.event_fields.by_field[f].missing++
    }

    evaluation.summary.categories_count += ev.db.categories.length
    evaluation.summary.access_routes_count += ev.db.access_routes.length
    evaluation.summary.accommodations_count += ev.db.accommodations.length

    // official_url がある場合、詳細ページを fetch して抽出
    if (row.official_url) {
      try {
        const html = await fetchHtml(row.official_url)
        const sourceType = getSourceType(row.official_url)
        ev.extracted = extractDetailBySource(html, sourceType)

        // 抽出結果と DB の差分を記録
        if (ev.extracted.events.event_date && !row.event_date) {
          ev.gap.events.filled.push('event_date (extractable)')
          ev.gap.events.missing = ev.gap.events.missing.filter((x) => x !== 'event_date')
        }
        if (ev.extracted.categories.length > 0 && ev.db.categories.length === 0) {
          ev.gap.categories.push('extractable but not in DB')
        }
        if (ev.extracted.access_routes.length > 0 && ev.db.access_routes.length === 0) {
          ev.gap.access_routes.push('extractable but not in DB')
        }
      } catch (e) {
        ev.fetch_error = e.message
      }
    }

    evaluation.results.push(ev)
    const pct = Math.round(((i + 1) / events.rows.length) * 100)
    process.stdout.write(`\r[${i + 1}/${events.rows.length}] ${pct}%`)
  }

  // サマリ集計
  evaluation.summary.event_fields.filled = Object.values(evaluation.summary.event_fields.by_field).reduce(
    (s, v) => s + v.filled,
    0
  )
  evaluation.summary.event_fields.missing = Object.values(evaluation.summary.event_fields.by_field).reduce(
    (s, v) => s + v.missing,
    0
  )

  await client.end()

  const outPath = resolve(process.cwd(), 'scripts/crawl/evaluation-result.json')
  writeFileSync(outPath, JSON.stringify(evaluation, null, 2), 'utf8')

  console.log('\n\n--- Evaluation Summary ---')
  console.log(`Total events: ${evaluation.total_events}`)
  console.log(`Events with official_url: ${evaluation.events_with_url}`)
  console.log(`Junk candidates: ${evaluation.junk_candidates.length}`)
  console.log(`Categories in DB: ${evaluation.summary.categories_count}`)
  console.log(`Access routes in DB: ${evaluation.summary.access_routes_count}`)
  console.log(`Accommodations in DB: ${evaluation.summary.accommodations_count}`)
  console.log(`\n結果を保存: ${outPath}`)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
