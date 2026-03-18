/**
 * ① レース名収集スクリプト
 * CHECK_TARGET_URLS.md の全ソースからレース URL を収集し、events テーブルに投入
 * collected_at = NULL でマーク（未エンリッチ）
 *
 * 使い方:
 *   npm run crawl:collect               # 全件
 *   npm run crawl:collect -- --dry-run  # DB更新なし
 *   npm run crawl:collect -- --limit 5  # 最初の5件のみ
 */
import pg from 'pg'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import * as cheerio from 'cheerio'
import { extract as extractAExtremo } from '../crawl-extract/extract-a-extremo.js'
import { extract as extractGoldenTrail } from '../crawl-extract/extract-golden-trail.js'
import { extract as extractSpartan } from '../crawl-extract/extract-spartan.js'
import { extract as extractUtmb } from '../crawl-extract/extract-utmb.js'
import { extract as extractHyrox } from '../crawl-extract/extract-hyrox.js'
import { extract as extractStrongViking } from '../crawl-extract/extract-strong-viking.js'
import { extract as extractHardrock, extractFromCsv as extractHardrockCsv } from '../crawl-extract/extract-hardrock.js'
import { extract as extractNisekoExpedition } from '../crawl-extract/extract-niseko-expedition.js'
import { extract as extractARWorldSeries } from '../crawl-extract/extract-ar-world-series.js'
import { extract as extractAdventure1 } from '../crawl-extract/extract-adventure1.js'

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

const SCHEMA = process.env.SUPABASE_SCHEMA ?? 'yabai_travel'
const IS_STAGING = SCHEMA !== 'yabai_travel'

/** ステージングでは件数を絞り、本番では全件取得 */
function limitForEnv(arr, stagingLimit) {
  return IS_STAGING ? arr.slice(0, stagingLimit) : arr
}

// --- 共通ユーティリティ ---

async function fetchHtml(url, timeoutMs = 15000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' },
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

// --- 名前クリーニング ---

/** 先頭の日付パターンを除去（例: "2026/5/16(土) 野辺山マラソン" → "野辺山マラソン"） */
function cleanEventName(name) {
  return (name || '')
    .replace(/^\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}[\(（][月火水木金土日][\)）]?\s*/, '')
    .replace(/^\d{4}年\d{1,2}月\d{1,2}日[\(（][月火水木金土日][\)）]?\s*/, '')
    .trim()
}

// --- ジャンク除去 ---

const JUNK_NAMES = /^(shopping_cart|Sign in|Orders|Online Shop|主催者の皆さまへ|大会主催者の方へ|エントリーガイド|OCR World Champs|SPARTAN TRAIL)$/i
const JUNK_PATTERNS = [
  /^エントリー\s*\d{4}\.\d{2}\.\d{2}/m,
  /^【スポーツの話題はこちら】/,
  /TICKET PRICES RISE.*REGISTER NOW/i,
  /^プレスリリース$/i,
]
/** エンデュランス系ではないイベントを除外するキーワード (#67) */
const NON_ENDURANCE_KEYWORDS = /スカッシュ|バドミントン|テニス|ゴルフ|卓球|ボウリング|ダーツ|ビリヤード|ゲートボール|クリケット|カーリング|アーチェリー|射撃|フェンシング|レスリング|柔道|空手|剣道|弓道|相撲|ボクシング|ラグビー|サッカー|フットサル|バレーボール|バスケ|ハンドボール|野球|ソフトボール|ホッケー|クリテリウム|ヒルクライム|サイクリング|自転車[旅競]|ロードレース(?!.*ラン)|エンデューロ(?!.*ラン)|練習会|走行会|トーナメント|選手権(?!.*マラソン|.*トレイル|.*トライアスロン|.*ラン)|プロアマ|グラベル/i
function isJunk(name) {
  const t = name?.trim() ?? ''
  return JUNK_NAMES.test(t) || JUNK_PATTERNS.some((p) => p.test(t)) || NON_ENDURANCE_KEYWORDS.test(t)
}

// --- ソース別のレースURL収集 ---

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
      const entryUrl = href.startsWith('http') ? href : new URL(href, 'https://runnet.jp/').href
      races.push({ name, official_url: null, entry_url: entryUrl, race_type: 'trail', source: 'runnet' })
    })
  } catch (e) { console.warn('  RUNNET collect error:', e.message) }
  return limitForEnv(races, 5)
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
      const entryUrl = href.startsWith('http') ? href : new URL(href, 'https://www.sportsentry.ne.jp/').href
      races.push({ name, official_url: null, entry_url: entryUrl, race_type: 'other', source: 'sports-entry' })
    })
  } catch (e) { console.warn('  SportsEntry collect error:', e.message) }
  return limitForEnv(races, 3)
}

/** LAWSON DO! SPORTS: トップからレースURLを収集 */
async function collectLawsonRaces() {
  const races = []
  try {
    const html = await fetchHtml('https://do.l-tike.com/')
    const $ = cheerio.load(html)
    $('a[href*="race/detail"]').each((_, el) => {
      const href = $(el).attr('href')
      const name = cleanEventName($(el).text().trim())
      if (!href || !name || name.length < 5 || name.length > 100) return
      const entryUrl = href.startsWith('http') ? href : new URL(href, 'https://do.l-tike.com/').href
      races.push({ name, official_url: null, entry_url: entryUrl, race_type: 'other', source: 'lawson-do' })
    })
  } catch (e) { console.warn('  LAWSON DO collect error:', e.message) }
  return limitForEnv(races, 3)
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
    if (url.includes('nisekoexpedition.jp')) {
      const { races } = extractNisekoExpedition(html)
      return races.map((r) => ({ ...r, source: 'niseko-expedition' }))
    }
    if (url.includes('arworldseries.com')) {
      const { races } = extractARWorldSeries(html)
      return races.map((r) => ({ ...r, source: 'ar-world-series' }))
    }
    if (url.includes('adventure1series.com')) {
      const { races } = extractAdventure1(html)
      return races.map((r) => ({ ...r, source: 'adventure1' }))
    }
    if (url.includes('hardrock100.com')) {
      // Hardrock: iframe 内の Google Spreadsheet から CSV を取得
      const { _csvUrl } = extractHardrock(html)
      if (_csvUrl) {
        try {
          const csvRes = await fetch(_csvUrl, { redirect: 'follow' })
          if (csvRes.ok) {
            const csvText = await csvRes.text()
            const races = extractHardrockCsv(csvText)
            return races.map((r) => ({ ...r, source: 'hardrock' }))
          }
        } catch (e) { console.warn('  Hardrock CSV fetch error:', e.message) }
      }
      return []
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
        races.push({ name: `Tough Mudder ${text}`, official_url: officialUrl, entry_url: officialUrl, race_type: 'tough_mudder', source: 'tough-mudder' })
      })
      return limitForEnv(races, 3)
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
      return limitForEnv(races, 1)
    }
    if (url.includes('albatros-adventure-marathons.com')) {
      const $ = cheerio.load(html)
      const races = []
      // 各レースはカード/セクション内にタイトルとリンクがある構造
      // 「〇〇の詳細を見る」リンクラベルを除外し、見出し/タイトル要素からイベント名を取得
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href')
        const text = $(el).text().trim()
        // 「の詳細を見る」で終わるリンクラベルはスキップ
        if (!href || !text || text.includes('の詳細を見る')) return
        if (text.length < 5 || text.length > 80) return
        if (!/marathon|ultra|trail/i.test(text)) return
        // /german 等の言語別パスは除外し、実際のレースページURLのみ取得
        const officialUrl = href.startsWith('http') ? href : new URL(href, url).href
        if (/\/(german|french|spanish|italian)\b/i.test(officialUrl)) return
        races.push({ name: text, official_url: officialUrl, entry_url: officialUrl, race_type: 'marathon', source: 'albatros' })
      })
      return limitForEnv(races, 1)
    }
  } catch { return [] }
  return []
}

// --- DB挿入 ---

async function insertRace(client, race) {
  // official_url OR (name + event_date) で重複チェック
  // - official_url 一致 → 重複
  // - name 一致 AND (どちらかの event_date が NULL OR 同じ日付) → 重複（別年度は通す）
  const dupCheck = `WHERE NOT EXISTS (
    SELECT 1 FROM ${SCHEMA}.events
    WHERE official_url = $6
       OR (name = $1 AND ($2 IS NULL OR event_date IS NULL OR event_date::text = $2::text))
  )`
  const result = await client.query(
    `INSERT INTO ${SCHEMA}.events (name, event_date, location, country, race_type, official_url, entry_url, collected_at)
     SELECT $1, $2::date, $3, $4, $5, $6, $7, NULL
     ${dupCheck}
     RETURNING id`,
    [
      race.name,
      race.event_date || null,
      race.location || null,
      race.country || null,
      race.race_type || 'other',
      race.official_url || null,
      race.entry_url || race.official_url || null,
    ]
  )
  return result.rows[0]?.id || null
}

// --- メイン ---

async function run() {
  const client = DRY_RUN ? null : new pg.Client({ connectionString: process.env.DATABASE_URL })
  if (client) await client.connect()

  console.log(`=== レース名収集開始 (DRY_RUN: ${DRY_RUN}) ===\n`)

  const allUrls = parseCheckUrls()
  let allRaces = []

  const spartanUrls = allUrls.filter((u) => u.includes('spartan.com'))
  const otherUrls = allUrls.filter((u) => !u.includes('spartan.com'))

  // Spartan: 各国からレース収集
  for (const url of spartanUrls) {
    const races = await collectSpartanRaces(url)
    const limited = limitForEnv(races, 1)
    if (limited.length) {
      allRaces.push(...limited)
      console.log(`  [spartan] ${url.slice(0, 35)} → ${limited.length} races`)
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
    const limited = limitForEnv(races, 1)
    if (limited.length) {
      allRaces.push(...limited)
      console.log(`  [${limited[0].source}] ${limited.length} races`)
    }
  }

  // ジャンク除去・重複除去
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

  const targets = allRaces.slice(0, LIMIT)
  let inserted = 0
  let skipped = 0
  let errors = 0

  for (let i = 0; i < targets.length; i++) {
    const race = targets[i]
    const label = `[${i + 1}/${targets.length}]`

    if (!race.official_url && !race.name) {
      console.log(`${label} SKIP (no URL/name) ${race.name?.slice(0, 40)}`)
      skipped++
      continue
    }

    if (DRY_RUN) {
      console.log(`${label} DRY ${race.name?.slice(0, 40)} | ${race.source} | ${race.official_url?.slice(0, 50)}`)
      continue
    }

    try {
      const id = await insertRace(client, race)
      if (id) {
        inserted++
        console.log(`${label} OK  ${race.name?.slice(0, 40)} | ${race.source}`)
      } else {
        skipped++
        console.log(`${label} DUP ${race.name?.slice(0, 40)}`)
      }
    } catch (e) {
      errors++
      console.log(`${label} ERR ${race.name?.slice(0, 40)} | ${e.message?.slice(0, 60)}`)
    }
  }

  if (client) await client.end()

  console.log(`\n=== 完了 ===`)
  console.log(`Inserted: ${inserted}, Skipped: ${skipped}, Errors: ${errors}`)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
