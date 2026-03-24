/**
 * enrich スクリプト共有ユーティリティ
 * enrich-event.js / enrich-category-detail.js から使用
 */
import Anthropic from '@anthropic-ai/sdk'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import * as cheerio from 'cheerio'

// --- 環境変数 ---

export function loadEnv() {
  for (const envFile of ['.env.local', '.env']) {
    const envPath = resolve(process.cwd(), envFile)
    if (existsSync(envPath)) {
      readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
        const m = line.match(/^([^#=]+)=(.*)$/)
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
      })
      break
    }
  }
}

// --- 定数 ---

export const PORTAL_DOMAINS = [
  'sportsentry.ne.jp', 'runnet.jp', 'do.l-tike.com', 'l-tike.com', 'moshicom.com',
]

export const AGGREGATOR_DOMAINS = [
  'runnet.jp', 'sports-entry.com', 'lawson-do.jp', 'l-tike.com', 'moshicom.com',
  'facebook.com', 'twitter.com', 'x.com', 'instagram.com', 'youtube.com',
  'adobe.com', 'apple.com', 'google.com', 'line.me', 'amazon.co.jp',
]

export const RELEVANT_URL_PATTERNS = [
  '/schedule', '/about', '/course', '/entry', '/rule', '/access',
  '/info', '/detail', '/category', '/distance', '/fee', '/registration',
  '/gear', '/equipment', '/transport', '/location', '/venue', '/map',
]

export const VALID_RACE_TYPES = [
  'marathon', 'trail', 'triathlon', 'bike', 'duathlon', 'rogaining',
  'spartan', 'hyrox', 'tough_mudder', 'obstacle', 'adventure', 'devils_circuit', 'strong_viking',
]

const RACE_TYPE_CLASSIFY_PROMPT = `あなたはレースイベントの分類エキスパートです。
イベント名から race_type を判定してください。

分類基準:
- marathon: ロードレース、マラソン、ハーフマラソン、リレーマラソン、ファンラン、ウルトラマラソン、ウルトラマラニック等の舗装路ランニング大会
- trail: トレイルランニング、山岳レース、ウルトラトレイル等の未舗装路ランニング大会
- triathlon: トライアスロン（スイム+バイク+ラン）、アクアスロン
- bike: 自転車レース、クリテリウム、ヒルクライム、ロングライド、グラベル、エンデューロ（自転車）、サイクルフェスタ、ツール・ド
- duathlon: デュアスロン（ラン+バイク+ラン）
- rogaining: ロゲイニング、フォトロゲ
- spartan: スパルタンレース
- hyrox: HYROX
- obstacle: OCR・障害物レース（スパルタン・HYROX以外）、タフマダー
- adventure: アドベンチャーレース
- other: 上記に該当しない場合のみ

race_type の値のみを返してください（例: marathon）。説明は不要です。`

// --- 言語検出 ---

/**
 * テキストの言語をヒューリスティックに検出する（LLM不使用）
 * 日本語文字（ひらがな・カタカナ・漢字）の比率で判定
 * @param {string} text - 検出対象テキスト
 * @returns {'ja' | 'en'} 検出された言語
 */
export function detectLanguage(text) {
  if (!text || text.length === 0) return 'ja'
  const jaChars = text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g)
  const ratio = (jaChars?.length || 0) / text.length
  return ratio > 0.1 ? 'ja' : 'en'
}

// --- HTML 取得・解析 ---

export async function fetchHtml(url, timeoutMs = 15000) {
  for (let attempt = 0; attempt < 2; attempt++) {
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
      if (attempt === 0 && (e.name === 'AbortError' || e.code === 'ECONNREFUSED' || e.code === 'ECONNRESET')) {
        await new Promise((r) => setTimeout(r, 3000))
        continue
      }
      throw e
    }
  }
}

export function extractRelevantContent(html, maxChars = 10000) {
  const $ = cheerio.load(html)
  $('script, style, svg, iframe, noscript').remove()
  $('[class*="cookie"], [class*="banner"], [class*="popup"], [class*="modal"]').remove()
  $('[class*="newsletter"], [class*="subscribe"]').remove()

  $('table').each((_, table) => {
    const rows = []
    $(table).find('tr').each((_, tr) => {
      const cells = []
      $(tr).find('th, td').each((_, td) => {
        cells.push($(td).text().trim().replace(/\s+/g, ' '))
      })
      if (cells.some(Boolean)) rows.push(cells.join(' | '))
    })
    $(table).replaceWith(rows.join('\n'))
  })

  const text = $('body').text().replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  return text.length <= maxChars ? text : text.slice(0, maxChars) + '\n[...truncated]'
}

export function extractExternalOfficialLinks(html, baseUrl) {
  const $ = cheerio.load(html)
  const base = new URL(baseUrl)
  const links = []
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return
    try {
      const absolute = href.startsWith('http') ? href : new URL(href, baseUrl).href
      const parsed = new URL(absolute)
      if (parsed.hostname === base.hostname) return
      if (AGGREGATOR_DOMAINS.some((d) => parsed.hostname.includes(d))) return
      if (!links.includes(absolute)) links.push(absolute)
    } catch { /* ignore */ }
  })
  return links.slice(0, 3)
}

export function extractRelevantLinks(html, baseUrl) {
  const $ = cheerio.load(html)
  const links = []
  const base = new URL(baseUrl)
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return
    try {
      const absolute = href.startsWith('http') ? href : new URL(href, baseUrl).href
      const parsed = new URL(absolute)
      if (parsed.hostname !== base.hostname) return
      const path = parsed.pathname.toLowerCase()
      if (RELEVANT_URL_PATTERNS.some((p) => path.includes(p))) {
        if (!links.includes(absolute)) links.push(absolute)
      }
    } catch { /* ignore */ }
  })
  return links.slice(0, 10)
}

// --- エラークラス ---

export class InsufficientBalanceError extends Error {
  constructor(message) {
    super(message)
    this.name = 'InsufficientBalanceError'
  }
}

// --- LLM ---

export async function callLlm(anthropic, systemPrompt, userContent, { maxTokens = 2048 } = {}) {
  let lastError
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userContent }],
      })
      const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('LLM JSON parse error: no JSON found')
      return { ...JSON.parse(jsonMatch[0]), _usage: msg.usage }
    } catch (e) {
      lastError = e
      if (e.status === 400 && e.error?.error?.message?.includes('credit')) {
        throw new InsufficientBalanceError(`Anthropic クレジット残高不足: ${e.error.error.message}`)
      }
      if (e.status === 402) {
        throw new InsufficientBalanceError(`Anthropic 残高不足 (402)`)
      }
      if (attempt === 0 && e.status === 429) {
        console.warn(`  [LLM] 429 rate limit、60秒待機してリトライ...`)
        await new Promise((r) => setTimeout(r, 60000))
        continue
      }
      if (attempt === 0 && (e.message?.includes('JSON') || e.message?.includes('parse') || e instanceof SyntaxError)) {
        continue
      }
      throw e
    }
  }
  throw lastError
}

// --- Tavily ---

export async function fetchTavilySearch(query, { includeUrls = false } = {}) {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) return []
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, max_results: 3, search_depth: 'basic' }),
    })
    if (!res.ok) return []
    const data = await res.json()
    if (includeUrls) {
      return (data.results || []).map((r) => ({ content: r.content || '', url: r.url || '' })).filter((r) => r.content)
    }
    return (data.results || []).map((r) => r.content || '').filter(Boolean)
  } catch {
    return []
  }
}

// --- ポータル判定 ---

export function isPortalUrl(url) {
  if (!url) return false
  return PORTAL_DOMAINS.some((d) => url.includes(d))
}

// --- race_type 再分類 ---

export async function reclassifyRaceType(anthropic, eventName) {
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 32,
      system: [{ type: 'text', text: RACE_TYPE_CLASSIFY_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: eventName }],
    })
    const text = (msg.content[0].type === 'text' ? msg.content[0].text : '').trim().toLowerCase()
    if (VALID_RACE_TYPES.includes(text)) return text
    return null
  } catch {
    return null
  }
}

// --- カテゴリ名正規化 ---

export function normalizeCategoryName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/\d+\.?\d*\s*(km|k)\b/g, '')
    .trim()
}

const CATEGORY_ALIASES = {
  long:   ['ロング', 'lng', 'long'],
  middle: ['ミドル', 'mid', 'middle'],
  short:  ['ショート', 'sht', 'short'],
  kids:   ['キッズ', 'kid', '小学生', '子供', 'children'],
  full:   ['フル', 'full', 'マラソン'],
  half:   ['ハーフ', 'half'],
  ultra:  ['ウルトラ', 'ultra'],
}

export function findMatchingCategory(categories, targetName) {
  const norm = normalizeCategoryName(targetName)
  if (!norm) return null
  let match = categories.find((c) => normalizeCategoryName(c.name) === norm)
  if (match) return match
  match = categories.find((c) => {
    const cn = normalizeCategoryName(c.name)
    return cn.includes(norm) || norm.includes(cn)
  })
  if (match) return match
  for (const aliases of Object.values(CATEGORY_ALIASES)) {
    const normAliases = aliases.map(normalizeCategoryName)
    const targetInGroup = normAliases.some((a) => norm.includes(a) || a.includes(norm))
    if (targetInGroup) {
      match = categories.find((c) => {
        const cn = normalizeCategoryName(c.name)
        return normAliases.some((a) => cn.includes(a) || a.includes(cn))
      })
      if (match) return match
    }
  }
  return null
}

// --- コースマップ ---

const COURSE_MAP_PATTERNS = /course[-_]?map|コースマップ|コース図|course[-_]?profile|elevation[-_]?profile|高低図|標高図/i
const COURSE_MAP_FILE_EXT = /\.(png|jpe?g|gif|webp|pdf|svg)(\?|$)/i

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || `https://${process.env.SUPABASE_PROJECT_REF || 'wzkjnmowrlfgvkuzyiio'}.supabase.co`
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export async function extractAndSaveCourseMap(html, baseUrl, eventId, dbClient, schema) {
  if (!SUPABASE_SERVICE_KEY) return
  const $ = cheerio.load(html)
  const candidates = new Set()

  $('img[src]').each((_, el) => {
    const src = $(el).attr('src') || ''
    const alt = $(el).attr('alt') || ''
    const parentText = $(el).parent().text() || ''
    if (COURSE_MAP_PATTERNS.test(src) || COURSE_MAP_PATTERNS.test(alt) || COURSE_MAP_PATTERNS.test(parentText)) {
      if (COURSE_MAP_FILE_EXT.test(src)) {
        const url = src.startsWith('http') ? src : new URL(src, baseUrl).href
        candidates.add(url)
      }
    }
  })

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || ''
    const text = $(el).text() || ''
    if (COURSE_MAP_PATTERNS.test(href) || COURSE_MAP_PATTERNS.test(text)) {
      if (COURSE_MAP_FILE_EXT.test(href)) {
        const url = href.startsWith('http') ? href : new URL(href, baseUrl).href
        candidates.add(url)
      }
    }
  })

  if (candidates.size === 0) return

  const existing = await dbClient.query(
    `SELECT file_path FROM ${schema}.course_map_files WHERE event_id = $1`,
    [eventId]
  )
  if (existing.rows.length > 0) return

  let saved = 0
  for (const mapUrl of [...candidates].slice(0, 3)) {
    try {
      const res = await fetch(mapUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' },
        redirect: 'follow',
      })
      if (!res.ok) continue
      const contentType = res.headers.get('content-type') || ''
      if (!/(image|pdf)/i.test(contentType)) continue
      const buffer = Buffer.from(await res.arrayBuffer())
      if (buffer.length < 1000 || buffer.length > 10 * 1024 * 1024) continue

      const ext = mapUrl.match(/\.(png|jpe?g|gif|webp|pdf|svg)/i)?.[1]?.toLowerCase() || 'png'
      const storagePath = `${eventId}/${Date.now()}.${ext}`

      const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/course-maps/${storagePath}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          apikey: SUPABASE_SERVICE_KEY,
          'Content-Type': contentType,
        },
        body: buffer,
      })
      if (!uploadRes.ok) continue

      const year = new Date().getFullYear()
      const displayName = new URL(mapUrl).pathname.split('/').pop() || `course-map.${ext}`
      await dbClient.query(
        `INSERT INTO ${schema}.course_map_files (event_id, file_path, year, display_name) VALUES ($1, $2, $3, $4)`,
        [eventId, storagePath, year, displayName]
      )
      saved++
      console.log(`  [course-map] OK ${storagePath}`)
    } catch { /* ignore individual failures */ }
  }
}
