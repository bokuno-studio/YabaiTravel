/**
 * CHECK_TARGET_URLS の全 URL から 1 件ずつイベントを取得し、events テーブルに投入
 * 設計されたテーブル項目を可能な限り埋める
 *
 * 使い方: node scripts/crawl/fetch-one-per-source.js
 */
import pg from 'pg'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import * as cheerio from 'cheerio'
import { extract as extractAExtremo } from '../crawl-extract/extract-a-extremo.js'
import { extract as extractAExtremoDetail } from '../crawl-extract/extract-a-extremo-detail.js'
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

/** CHECK_TARGET_URLS.md から URL を抽出（重複除去） */
function parseUrls() {
  const path = resolve(process.cwd(), 'docs/data-sources/CHECK_TARGET_URLS.md')
  const content = readFileSync(path, 'utf8')
  const urls = []
  const lines = content.split('\n')
  for (const line of lines) {
    const m = line.match(/\|\s*(https:\/\/[^\s|]+)\s*\|/)
    if (m) urls.push(m[1].trim())
  }
  return [...new Set(urls)]
}

async function fetchHtml(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'YabaiTravel-Crawl/1.0 (event extraction)' },
    redirect: 'follow',
    ...opts,
  })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.text()
}

/** URL からソース種別とフェッチ URL を判定 */
function getSourceConfig(url) {
  if (url.includes('a-extremo.com')) return { type: 'a-extremo', fetchUrl: url }
  if (url.includes('goldentrailseries.com')) return { type: 'golden-trail', fetchUrl: url }
  if (url.includes('utmb.world/utmb-world-series')) return { type: 'utmb', fetchUrl: url }
  if (url.includes('hyrox.com')) return { type: 'hyrox', fetchUrl: url }
  if (url.includes('spartan.com')) {
    const base = url.replace(/\/$/, '')
    const fetchUrl = base + (base.endsWith('/en') ? '/race/find-race' : '/en/race/find-race')
    return { type: 'spartan', fetchUrl, baseUrl: base }
  }
  if (url.includes('toughmudder.com')) return { type: 'tough-mudder', fetchUrl: url }
  if (url.includes('strongviking.com')) {
    return {
      type: 'strong-viking',
      fetchUrls: [
        'https://strongviking.com/en/tickets/',
        'https://strongviking.com/en/events/',
        'https://strongviking.com/en/race-calendar/',
      ]
    }
  }
  if (url.includes('devilscircuit.com')) return { type: 'devils-circuit', fetchUrl: url }
  if (url.includes('runnet.jp')) return { type: 'runnet', fetchUrl: url }
  if (url.includes('sportsentry.ne.jp')) return { type: 'sports-entry', fetchUrl: url }
  if (url.includes('do.l-tike.com')) return { type: 'lawson-do', fetchUrl: url }
  if (url.includes('albatros-adventure-marathons.com')) return { type: 'albatros', fetchUrl: url }
  if (url.includes('ahotu.com')) return { type: 'ahotu', fetchUrl: url }
  if (url.includes('itra.run')) return { type: 'itra', fetchUrl: url }
  return { type: 'generic', fetchUrl: url }
}

/** RUNNET: racematome や runtes/guide のリンクを優先 */
function extractRunnet(html) {
  const $ = cheerio.load(html)
  const candidates = []
  $('a[href*="racematome"], a[href*="runtes/guide/weekly"]').each((_, el) => {
    const href = $(el).attr('href')
    const text = $(el).text().trim()
    if (href && text && text.length > 5 && text.length < 100) {
      const fullUrl = href.startsWith('http') ? href : new URL(href, 'https://runnet.jp/').href
      candidates.push({ name: text, official_url: fullUrl, entry_url: fullUrl })
    }
  })
  if (candidates.length === 0) return null
  return { ...candidates[0], event_date: null, location: null, race_type: 'marathon' }
}

/** 汎用: 最初のレース風リンクを1件取得（ナビ・ショップ等を除外） */
function tryGenericExtract(html, url) {
  const $ = cheerio.load(html)
  const skip = /^(大会主催者|Online Shop|エントリーガイド|Results|Rankings|Menu|Shop|About|Privacy|Terms|Cookies|Sign|Login|Register|Apply|Reset|Filters|一覧|へ|する|こちら|詳細|もっと|MORE|LEARN|DISCOVER|VIEW|READ|SEARCH|HOME|CONTACT|FOLLOW|SUBMIT|NEWS|BLOG|FAQ|HELP|SUPPORT|TRAIN|COMPETE|EXPERIENCE|ATHLETES|COACHES|AFFILIATE|PARTNERS|VOLUNTEER|PRESS|SPONSOR|JOBS|CAREERS|CART|ORDERS|ACCOUNT|PROFILE|SETTINGS|LOGOUT)$/i
  const candidates = []
  $('a[href^="http"]').each((_, el) => {
    const href = $(el).attr('href')
    const text = $(el).text().trim()
    if (href && text && text.length > 5 && text.length < 120 && !skip.test(text) && !/^(https?|#|mailto)/.test(text)) {
      candidates.push({ name: text, official_url: href, entry_url: href })
    }
  })
  if (candidates.length === 0) return null
  const c = candidates[0]
  return {
    name: c.name,
    event_date: null,
    official_url: c.official_url,
    entry_url: c.entry_url,
    location: null,
    race_type: 'other',
  }
}

/** Tough Mudder: イベントリンクを抽出 */
function extractToughMudder(html) {
  const $ = cheerio.load(html)
  const races = []
  $('a[href*="/events/"]').each((_, el) => {
    const $a = $(el)
    const href = $a.attr('href')
    const text = $a.text().trim()
    if (!href || !text || href.includes('season-pass') || text.includes('SEASON')) return
    const officialUrl = href.startsWith('http') ? href : new URL(href, 'https://toughmudder.com/').href
    const dateMatch = $a.closest('div').text().match(/([A-Za-z]{3})\s+(\d{1,2})/)
    let eventDate = null
    if (dateMatch) {
      const months = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 }
      const y = new Date().getFullYear()
      eventDate = `${y}-${String(months[dateMatch[1]] || 1).padStart(2, '0')}-${dateMatch[2].padStart(2, '0')}`
    }
    races.push({ name: text, event_date: eventDate, official_url: officialUrl, entry_url: officialUrl, location: null, race_type: 'obstacle' })
    return false
  })
  return races
}

/** Devils Circuit: 都市イベントから1件。DC Dubai → Dubai, UAE、他は India */
function extractDevilsCircuit(html) {
  const $ = cheerio.load(html)
  const races = []
  $('a[href*="devilscircuit"], button').each((_, el) => {
    const $el = $(el)
    const text = $el.find('h2, h3').first().text().trim() || $el.text().trim()
    if (!text || text.length < 3 || text.length > 80) return
    const cityMatch = text.match(/^([A-Za-z\s]+)$/m)
    if (cityMatch) {
      const city = cityMatch[1].trim()
      const displayCity = city.replace(/^DC\s+/, '') // DC Dubai → Dubai
      const location = /Dubai/i.test(city) ? 'Dubai, UAE' : city + ', India'
        races.push({
        name: `Devils Circuit ${displayCity}`,
        event_date: null,
        official_url: 'https://www.devilscircuit.com/',
        entry_url: 'https://www.devilscircuit.com/',
        location,
        race_type: 'devils_circuit',
      })
      return false
    }
  })
  return races
}

/** レースオブジェクトを events 行に変換 */
function toEventRow(race, sourceUrl) {
  return {
    name: race.name || 'Unknown',
    event_date: race.event_date || '2099-12-31',
    location: race.location ?? null,
    official_url: race.official_url ?? null,
    entry_url: race.entry_url ?? race.official_url ?? null,
    race_type: race.race_type ?? 'other',
    country: race.country ?? null,
    entry_end: race.entry_end ?? null,
    reception_place: race.reception_place ?? null,
    start_place: race.start_place ?? null,
    // 以下は categories / access_routes / accommodations 用
    distance_km: race.distance_km,
    entry_fee: race.entry_fee,
    elevation_gain: race.elevation_gain,
    time_limit: race.time_limit,
    route_detail: race.route_detail,
    recommended_area: race.recommended_area,
    avg_cost_3star: race.avg_cost_3star,
    start_time: race.start_time,
  }
}

async function run() {
  const urls = parseUrls()
  console.log(`Total URLs: ${urls.length}\n`)

  const client = process.env.DATABASE_URL ? new pg.Client({ connectionString: process.env.DATABASE_URL }) : null
  if (client) await client.connect()

  const inserted = []
  const errors = []

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]
    const config = getSourceConfig(url)
    try {
      const html = await fetchHtml(config.fetchUrl)
      let race = null

      if (config.type === 'a-extremo') {
        const out = extractAExtremo(html)
        race = out.races[0]
        if (race && race.official_url) {
          try {
            const detailHtml = await fetchHtml(race.official_url)
            const detail = extractAExtremoDetail(detailHtml)
            if (detail.distance_km) race.distance_km = detail.distance_km
            if (detail.entry_fee) race.entry_fee = detail.entry_fee
            if (detail.route_detail) race.route_detail = detail.route_detail
            if (detail.entry_end) race.entry_end = detail.entry_end
            if (detail.reception_place) race.reception_place = detail.reception_place
            if (detail.start_place) race.start_place = detail.start_place
            if (detail.start_time) race.start_time = detail.start_time
          } catch (_) {}
        }
      } else if (config.type === 'golden-trail') {
        const out = extractGoldenTrail(html)
        race = out.races[0]
      } else if (config.type === 'spartan') {
        const out = extractSpartan(html, config.baseUrl || config.fetchUrl.replace('/race/find-race', ''))
        race = out.races[0]
      } else if (config.type === 'utmb') {
        const out = extractUtmb(html)
        race = out.races[0]
      } else if (config.type === 'hyrox') {
        const out = extractHyrox(html)
        race = out.races[0]
      } else if (config.type === 'tough-mudder') {
        const races = extractToughMudder(html)
        race = races[0]
      } else if (config.type === 'strong-viking') {
        let allRaces = []
        // Fetch from all configured URLs and combine results
        const fetchUrls = config.fetchUrls || [config.fetchUrl]
        for (const fetchUrl of fetchUrls) {
          try {
            const urlHtml = await fetchHtml(fetchUrl)
            const out = extractStrongViking(urlHtml, fetchUrl)
            allRaces = allRaces.concat(out.races)
          } catch (e) {
            console.warn(`Failed to fetch ${fetchUrl}: ${e.message}`)
          }
        }
        // Deduplicate by official_url and take first occurrence
        const seen = new Set()
        const uniqueRaces = []
        for (const r of allRaces) {
          if (!seen.has(r.official_url)) {
            seen.add(r.official_url)
            uniqueRaces.push(r)
          }
        }
        race = uniqueRaces[0]
      } else if (config.type === 'devils-circuit') {
        const races = extractDevilsCircuit(html)
        race = races[0]
      } else if (config.type === 'runnet') {
        race = extractRunnet(html)
      }
      if (!race) {
        race = tryGenericExtract(html, url)
      }

      if (!race) {
        errors.push({ url, error: 'No event extracted' })
        console.log(`[${i + 1}/${urls.length}] SKIP ${config.type} (no event)`)
        continue
      }

      const junkNames = /^(shopping_cart|Sign in|Orders|Online Shop|主催者の皆さまへ|大会主催者の方へ|エントリーガイド|スポーツ関連プレス|プレスリリース|TICKET PRICES RISE|ARE YOU READY|SAY OORAH|OCR World Champs|SPARTAN TRAIL)$/i
      const junkNamePatterns = [
        /^エントリー\s*\d{4}\.\d{2}\.\d{2}/m, // RUNNET「エントリー 2026.03.02 忘れてませんか？」
        /^【スポーツの話題はこちら】/,
        /TICKET PRICES RISE.*REGISTER NOW/i,
        /^プレスリリース$/i,
      ]
      const nameTrimmed = race.name?.trim() ?? ''
      const isJunkExact = junkNames.test(nameTrimmed)
      const isJunkPattern = junkNamePatterns.some((p) => p.test(nameTrimmed))
      if (isJunkExact || isJunkPattern) {
        errors.push({ url, error: 'Junk name filtered' })
        console.log(`[${i + 1}/${urls.length}] SKIP ${config.type} (junk: ${race.name?.slice(0, 25)})`)
        continue
      }

      const row = toEventRow(race, url)

      if (client) {
        const exists = await client.query(
          `SELECT id FROM yabai_travel.events WHERE official_url = $1 OR (name = $2 AND event_date::text = $3)`,
          [row.official_url, row.name, row.event_date]
        )
        if (exists.rows.length > 0) {
          console.log(`[${i + 1}/${urls.length}] DUP ${row.name?.slice(0, 35)}`)
          continue
        }

        const eventResult = await client.query(
          `INSERT INTO yabai_travel.events (name, event_date, location, official_url, entry_url, race_type, country, entry_end, reception_place, start_place)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
          [
            row.name,
            row.event_date,
            row.location,
            row.official_url,
            row.entry_url,
            row.race_type,
            row.country,
            row.entry_end ?? null,
            row.reception_place ?? null,
            row.start_place ?? null,
          ]
        )
        const eventId = eventResult.rows[0].id

        // categories: 距離・参加費・標高等があれば投入
        const catName = race.category_name || 'メイン'
        const hasCategoryData =
          race.distance_km != null ||
          race.entry_fee != null ||
          race.elevation_gain != null ||
          race.time_limit != null ||
          race.start_time != null
        if (hasCategoryData || config.type === 'a-extremo') {
          await client.query(
            `INSERT INTO yabai_travel.categories (event_id, name, distance_km, entry_fee, elevation_gain, time_limit, start_time)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              eventId,
              catName,
              race.distance_km ?? null,
              race.entry_fee ?? null,
              race.elevation_gain ?? null,
              race.time_limit ?? null,
              race.start_time ?? null,
            ]
          )
        }

        // access_routes: 経路情報があれば投入
        if (race.route_detail) {
          await client.query(
            `INSERT INTO yabai_travel.access_routes (event_id, direction, route_detail) VALUES ($1, $2, $3)`,
            [eventId, 'outbound', race.route_detail]
          )
        }

        // accommodations: 前泊推奨地・費用目安があれば投入
        if (race.recommended_area || race.avg_cost_3star != null) {
          await client.query(
            `INSERT INTO yabai_travel.accommodations (event_id, recommended_area, avg_cost_3star) VALUES ($1, $2, $3)`,
            [eventId, race.recommended_area ?? null, race.avg_cost_3star ?? null]
          )
        }
      }

      inserted.push({ url: config.type, name: row.name })
      console.log(`[${i + 1}/${urls.length}] OK ${row.name?.slice(0, 40)}`)
    } catch (e) {
      errors.push({ url, error: e.message })
      console.log(`[${i + 1}/${urls.length}] ERR ${e.message}`)
    }
  }

  if (client) await client.end()

  console.log('\n--- Summary ---')
  console.log(`Inserted: ${inserted.length}, Errors: ${errors.length}`)
  if (errors.length) {
    console.log('\nErrors:')
    errors.forEach((e) => console.log(`  ${e.url}: ${e.error}`))
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
