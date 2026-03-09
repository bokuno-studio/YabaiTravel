/**
 * 本番クロールスクリプト
 * CHECK_TARGET_URLS.md の全ソースからレース情報を取得し、DB に投入
 *
 * フェーズ1（一覧取得）: 各ソースの一覧ページからレース URL を収集
 * フェーズ2（詳細埋め）: 別チケット。詳細は SPEC_CRAWL_PHASE_FLOW.md 参照
 *
 * 現状: フェーズ1 の収集後に、詳細ページ取得 → LLM 抽出 → DB 投入（将来フェーズ2 に分離予定）
 *
 * 使い方:
 *   npm run crawl:run               # 全件
 *   npm run crawl:run -- --dry-run   # DB更新なし
 *   npm run crawl:run -- --limit 5   # 最初の5件のみ
 */
import pg from 'pg'
import Anthropic from '@anthropic-ai/sdk'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import * as cheerio from 'cheerio'
import { extract as extractAExtremo } from '../crawl-extract/extract-a-extremo.js'
import { extract as extractGoldenTrail } from '../crawl-extract/extract-golden-trail.js'
import { extract as extractSpartan } from '../crawl-extract/extract-spartan.js'
import { extract as extractUtmb } from '../crawl-extract/extract-utmb.js'
import { extract as extractHyrox } from '../crawl-extract/extract-hyrox.js'
import { extract as extractStrongViking } from '../crawl-extract/extract-strong-viking.js'

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

// --- 共通ユーティリティ ---

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

/** HTML からレース情報に関連する部分だけを抽出してトークン節約 */
function extractRelevantContent(html, maxChars = 8000) {
  const $ = cheerio.load(html)
  $('script, style, svg, nav, footer, header, iframe, noscript, meta, link').remove()
  $('[class*="cookie"], [class*="banner"], [class*="popup"], [class*="modal"]').remove()
  $('[class*="newsletter"], [class*="subscribe"]').remove()
  const text = $('body').text().replace(/\s+/g, ' ').trim()
  return text.length <= maxChars ? text : text.slice(0, maxChars) + '\n[...truncated]'
}

const LLM_SYSTEM_PROMPT = `あなたはレースイベントの情報抽出エキスパートです。
与えられた公式ページの内容から、以下の JSON 形式で情報を抽出してください。

{
  "event": {
    "name": "正式な大会名",
    "event_date": "YYYY-MM-DD（開催初日）",
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
      "entry_fee_currency": "JPY|USD|EUR|NZD|AUD|PHP|SGD|GBP|CHF|KRW|CNY|THB|MXN 等のISO通貨コード",
      "start_time": "HH:MM",
      "time_limit": "HH:MM:SS",
      "mandatory_gear": "必携品リスト"
    }
  ]
}

ルール:
- ページに記載がない項目は null にする。推測しない
- 日付は YYYY-MM-DD 形式
- entry_fee は現地通貨の数値。¥5000 → 5000 + "JPY"、$129 → 129 + "USD"、€85 → 85 + "EUR"
- categories は記載されている全カテゴリ
- JSON のみ返す`

// --- フェーズ1: ソース別のレースURL収集 ---

/** CHECK_TARGET_URLS.md から URL を抽出 */
function parseCheckUrls() {
  const path = resolve(process.cwd(), 'docs/data-sources/CHECK_TARGET_URLS.md')
  const content = readFileSync(path, 'utf8')
  const urls = []
  for (const line of content.split('\n')) {
    const m = line.match(/\|\s*(https:\/\/[^\s|]+)\s*\|/)
    if (m) urls.push(m[1].trim())
  }
  return [...new Set(urls)]
}

/** Spartan: find-race ページから各国の全レースURLを取得 */
async function collectSpartanRaces(url) {
  const base = url.replace(/\/$/, '')
  const fetchUrl = base + (base.endsWith('/en') ? '/race/find-race' : '/en/race/find-race')
  try {
    const html = await fetchHtml(fetchUrl)
    const { races } = extractSpartan(html, base)
    return races.map((r) => ({ ...r, source: 'spartan' }))
  } catch { return [] }
}

/** RUNNET: トレイル検索結果からレースURLを収集 */
async function collectRunnetRaces() {
  const races = []
  try {
    const html = await fetchHtml('https://runnet.jp/entry/runtes/user/pc/RaceSearchZZSDetailAction.do?command=search&available=1&distanceClass=6')
    const $ = cheerio.load(html)
    $('a[href*="competitionDetailAction"], a[href*="moshicomDetailAction"]').each((_, el) => {
      const href = $(el).attr('href')
      const name = $(el).text().trim()
      if (!href || !name || name.length < 3) return
      const officialUrl = href.startsWith('http') ? href : new URL(href, 'https://runnet.jp/').href
      races.push({ name, official_url: officialUrl, entry_url: officialUrl, race_type: 'trail', source: 'runnet' })
    })
  } catch (e) { console.warn('  RUNNET collect error:', e.message) }
  return races.slice(0, 5)
}

/** スポーツエントリー: トップページからレースURLを収集 */
async function collectSportsEntryRaces() {
  const races = []
  try {
    const html = await fetchHtml('https://www.sportsentry.ne.jp/')
    const $ = cheerio.load(html)
    $('a[href*="/event/"]').each((_, el) => {
      const href = $(el).attr('href')
      const name = $(el).text().trim()
      if (!href || !name || name.length < 5 || name.length > 100) return
      const officialUrl = href.startsWith('http') ? href : new URL(href, 'https://www.sportsentry.ne.jp/').href
      races.push({ name, official_url: officialUrl, entry_url: officialUrl, race_type: 'other', source: 'sports-entry' })
    })
  } catch (e) { console.warn('  SportsEntry collect error:', e.message) }
  return races.slice(0, 3)
}

/** LAWSON DO! SPORTS: トップからレースURLを収集 */
async function collectLawsonRaces() {
  const races = []
  try {
    const html = await fetchHtml('https://do.l-tike.com/')
    const $ = cheerio.load(html)
    $('a[href*="race/detail"]').each((_, el) => {
      const href = $(el).attr('href')
      const name = $(el).text().trim()
      if (!href || !name || name.length < 5 || name.length > 100) return
      const officialUrl = href.startsWith('http') ? href : new URL(href, 'https://do.l-tike.com/').href
      races.push({ name, official_url: officialUrl, entry_url: officialUrl, race_type: 'other', source: 'lawson-do' })
    })
  } catch (e) { console.warn('  LAWSON DO collect error:', e.message) }
  return races.slice(0, 3)
}

/** その他の専用ソース */
async function collectOtherSourceRaces(url) {
  try {
    const html = await fetchHtml(url)
    if (url.includes('a-extremo.com')) {
      const { races } = extractAExtremo(html)
      return races.map((r) => ({ ...r, source: 'a-extremo' }))
    }
    if (url.includes('goldentrailseries.com')) {
      const { races } = extractGoldenTrail(html)
      return races.map((r) => ({ ...r, source: 'golden-trail' }))
    }
    if (url.includes('utmb.world/utmb-world-series')) {
      const { races } = extractUtmb(html)
      return races.map((r) => ({ ...r, source: 'utmb' }))
    }
    if (url.includes('hyrox.com')) {
      const { races } = extractHyrox(html)
      return races.map((r) => ({ ...r, source: 'hyrox' }))
    }
    if (url.includes('strongviking.com')) {
      const { races } = extractStrongViking(html)
      return races.map((r) => ({ ...r, source: 'strong-viking' }))
    }
    if (url.includes('toughmudder.com')) {
      const $ = cheerio.load(html)
      const races = []
      $('a[href*="/events/"]').each((_, el) => {
        const href = $(el).attr('href')
        const text = $(el).text().trim()
        if (!href || !text || href.includes('season-pass') || text.includes('SEASON') || text.length < 3) return
        const officialUrl = href.startsWith('http') ? href : new URL(href, 'https://toughmudder.com/').href
        if (races.find((r) => r.official_url === officialUrl)) return
        races.push({ name: `Tough Mudder ${text}`, official_url: officialUrl, entry_url: officialUrl, race_type: 'obstacle', source: 'tough-mudder' })
      })
      return races.slice(0, 3)
    }
    if (url.includes('devilscircuit.com')) {
      const $ = cheerio.load(html)
      const races = []
      $('h2, h3').each((_, el) => {
        const t = $(el).text().trim()
        if (/^(Delhi|Mumbai|Bengaluru|Pune|Hyderabad|Kochi|Chennai|Guwahati|Jaipur|Lucknow|Indore|Ahmedabad|Dubai)/i.test(t)) {
          races.push({ name: `Devils Circuit ${t}`, official_url: url, entry_url: url, location: `${t}, India`, race_type: 'devils_circuit', source: 'devils-circuit' })
        }
      })
      return races.slice(0, 1)
    }
    if (url.includes('albatros-adventure-marathons.com')) {
      const $ = cheerio.load(html)
      const races = []
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href')
        const text = $(el).text().trim()
        if (href && text && text.length > 5 && text.length < 80 && /marathon|ultra|trail/i.test(text)) {
          const officialUrl = href.startsWith('http') ? href : new URL(href, url).href
          races.push({ name: text, official_url: officialUrl, entry_url: officialUrl, race_type: 'adventure', source: 'albatros' })
        }
      })
      return races.slice(0, 1)
    }
  } catch { return [] }
  return []
}

// --- フェーズ2-4: LLM抽出 → DB投入 ---

const JUNK_NAMES = /^(shopping_cart|Sign in|Orders|Online Shop|主催者の皆さまへ|大会主催者の方へ|エントリーガイド|OCR World Champs|SPARTAN TRAIL)$/i
const JUNK_PATTERNS = [
  /^エントリー\s*\d{4}\.\d{2}\.\d{2}/m,
  /^【スポーツの話題はこちら】/,
  /TICKET PRICES RISE.*REGISTER NOW/i,
  /^プレスリリース$/i,
]
function isJunk(name) {
  const t = name?.trim() ?? ''
  return JUNK_NAMES.test(t) || JUNK_PATTERNS.some((p) => p.test(t))
}

async function enrichWithLlm(pageContent, raceName, anthropic) {
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

async function upsertEvent(client, race, enriched) {
  const e = enriched?.event || {}
  const name = e.name || race.name
  const eventDate = e.event_date || race.event_date || null
  const officialUrl = race.official_url

  if (!eventDate || !officialUrl) return null

  const exists = await client.query(
    'SELECT id FROM yabai_travel.events WHERE official_url = $1',
    [officialUrl]
  )
  if (exists.rows.length > 0) return null

  const result = await client.query(
    `INSERT INTO yabai_travel.events (
       name, event_date, location, country, race_type, official_url, entry_url,
       entry_start, entry_end, reception_place, start_place
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      name, eventDate,
      e.location || race.location || null,
      e.country || null,
      e.race_type || race.race_type || 'other',
      officialUrl,
      e.entry_url || race.entry_url || officialUrl,
      e.entry_start || null, e.entry_end || null,
      e.reception_place || null, e.start_place || null,
    ]
  )
  const eventId = result.rows[0].id

  for (const cat of enriched?.categories || []) {
    if (!cat.name) continue
    await client.query(
      `INSERT INTO yabai_travel.categories (event_id, name, distance_km, elevation_gain, entry_fee, entry_fee_currency, start_time, time_limit, mandatory_gear)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [eventId, cat.name, cat.distance_km ?? null, cat.elevation_gain ?? null,
       cat.entry_fee != null ? parseInt(cat.entry_fee, 10) : null,
       cat.entry_fee_currency || null,
       cat.start_time || null, cat.time_limit || null, cat.mandatory_gear || null]
    )
  }

  return eventId
}

// --- メイン ---

async function run() {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const client = DRY_RUN ? null : new pg.Client({ connectionString: process.env.DATABASE_URL })
  if (client) await client.connect()

  console.log(`=== クロール開始 (DRY_RUN: ${DRY_RUN}) ===\n`)

  // フェーズ1: レースURL収集
  console.log('--- フェーズ1: レースURL収集 ---')
  const allUrls = parseCheckUrls()
  let allRaces = []

  const spartanUrls = allUrls.filter((u) => u.includes('spartan.com'))
  const otherUrls = allUrls.filter((u) => !u.includes('spartan.com'))

  // Spartan: 各国から1件ずつ
  for (const url of spartanUrls) {
    const races = await collectSpartanRaces(url)
    if (races.length) {
      allRaces.push(races[0])
      console.log(`  [spartan] ${url.slice(0, 35)} → ${races[0].name?.slice(0, 30)}`)
    }
  }

  // RUNNET / スポーツエントリー / LAWSON DO!
  const runnetRaces = await collectRunnetRaces()
  console.log(`  [runnet] ${runnetRaces.length} races`)
  allRaces.push(...runnetRaces)

  const seRaces = await collectSportsEntryRaces()
  console.log(`  [sports-entry] ${seRaces.length} races`)
  allRaces.push(...seRaces)

  const lawsonRaces = await collectLawsonRaces()
  console.log(`  [lawson-do] ${lawsonRaces.length} races`)
  allRaces.push(...lawsonRaces)

  // その他ソース
  for (const url of otherUrls) {
    if (url.includes('runnet.jp') || url.includes('sportsentry.ne.jp') || url.includes('do.l-tike.com')) continue
    if (url.includes('itra.run') || url.includes('ahotu.com')) continue
    const races = await collectOtherSourceRaces(url)
    if (races.length) {
      allRaces.push(races[0])
      console.log(`  [${races[0].source}] ${races[0].name?.slice(0, 40)}`)
    }
  }

  // ジャンク除去・重複除去（official_url + name の両方でチェック）
  allRaces = allRaces.filter((r) => !isJunk(r.name))
  const seenUrls = new Set()
  const seenNames = new Set()
  allRaces = allRaces.filter((r) => {
    if (r.official_url && seenUrls.has(r.official_url)) return false
    if (r.name && seenNames.has(r.name)) return false
    if (r.official_url) seenUrls.add(r.official_url)
    if (r.name) seenNames.add(r.name)
    return true
  })

  console.log(`\n収集完了: ${allRaces.length} races\n`)

  // フェーズ2-4: 詳細取得 → LLM → DB
  console.log('--- フェーズ2-4: 詳細取得 → LLM → DB ---')
  const targets = allRaces.slice(0, LIMIT)
  let inserted = 0
  let enriched = 0
  let errors = 0
  let totalTokens = 0

  for (let i = 0; i < targets.length; i++) {
    const race = targets[i]
    const label = `[${i + 1}/${targets.length}]`

    try {
      // 重複チェック
      if (client) {
        const exists = await client.query(
          'SELECT id FROM yabai_travel.events WHERE official_url = $1',
          [race.official_url]
        )
        if (exists.rows.length > 0) {
          console.log(`${label} DUP ${race.name?.slice(0, 35)}`)
          continue
        }
      }

      // 詳細ページ取得 → LLM
      let llmResult = null
      try {
        const html = await fetchHtml(race.official_url)
        const content = extractRelevantContent(html)
        if (content.length > 50) {
          llmResult = await enrichWithLlm(content, race.name, anthropic)
          totalTokens += (llmResult._usage?.input_tokens || 0) + (llmResult._usage?.output_tokens || 0)
          enriched++
        }
      } catch (e) {
        console.log(`${label} WARN LLM skip: ${e.message?.slice(0, 40)}`)
      }

      if (DRY_RUN) {
        console.log(`${label} DRY ${race.name?.slice(0, 35)} | cats:${llmResult?.categories?.length ?? 0} | ${race.source}`)
        continue
      }

      const eventId = await upsertEvent(client, race, llmResult)
      if (eventId) {
        inserted++
        console.log(`${label} OK ${race.name?.slice(0, 35)} | cats:${llmResult?.categories?.length ?? 0} | ${race.source}`)
      } else {
        console.log(`${label} DUP ${race.name?.slice(0, 35)}`)
      }
    } catch (e) {
      errors++
      console.log(`${label} ERR ${race.name?.slice(0, 35)} | ${e.message?.slice(0, 50)}`)
    }
  }

  if (client) await client.end()

  console.log(`\n=== 完了 ===`)
  console.log(`Inserted: ${inserted}, Enriched: ${enriched}, Errors: ${errors}`)
  console.log(`Total tokens: ${totalTokens}`)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
