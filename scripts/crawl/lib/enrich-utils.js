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
  '/checklist', '/kit', '/guide', '/outline', '/requirement',
]

// リンクテキストから関連ページを判定するキーワード
export const RELEVANT_LINK_TEXT_PATTERNS = [
  '装備', '持ち物', '必携', '携行', 'アクセス', '会場', '受付',
  '大会概要', '要項', '参加案内', 'コース',
  'equipment', 'gear', 'checklist', 'access', 'venue', 'course',
  'guide', 'outline', 'requirement', 'mandatory',
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
  try {
    const $ = cheerio.load(html)

    // Extract pricing data from script tags before removal
    const jsonData = []

    // 1. JSON-LD (構造化データ) を抽出
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const text = $(el).text().trim()
        if (text && (text.includes('price') || text.includes('offer') || text.includes('cost'))) {
          jsonData.push(text.slice(0, 1000))
        }
      } catch {}
    })

    // 2. script 内の料金関連 JSON を正規表現で抽出
    $('script:not([src])').each((_, el) => {
      const text = $(el).text()
      if (!text) return
      // woocommerce_params, vivenu, price, cost, fee 等を含む JSON を抽出
      const jsonPatterns = text.match(/\{[^{}]*(?:woocommerce_params|vivenu|price|cost|fee)[^{}]*\}/gi)
      if (jsonPatterns) {
        jsonData.push(...jsonPatterns.slice(0, 5).map(p => p.slice(0, 500)))
      }
      // price/fee/cost を含む JSON オブジェクトを抽出（quoted keys）
      const pricePatterns = text.match(/"(?:price|cost|fee)"\s*:\s*["{}\[\]0-9.]+/g)
      if (pricePatterns) {
        jsonData.push(...pricePatterns.slice(0, 5))
      }
      // unquoted keys（Nuxt/minified JS: price:92, name:"ELITE",price:92）
      const unquotedPrices = text.match(/(?:name|label):\s*"[^"]{1,60}"\s*,\s*price:\s*\d+/g)
      if (unquotedPrices) {
        jsonData.push(...unquotedPrices.slice(0, 10))
      }
      // registration_choices 配列から pricing を抽出
      const regChoices = text.match(/registration_choices:\[([^\]]{1,2000})\]/g)
      if (regChoices) {
        jsonData.push(...regChoices.slice(0, 3).map(p => p.slice(0, 800)))
      }
      // WooCommerce / vivenu 等の決済データ
      const wcMatch = text.match(/(?:var\s+\w+(?:params|data|config)|window\.\w+)\s*=\s*(\{[^;]{10,500})/i)
      if (wcMatch && (wcMatch[1].includes('price') || wcMatch[1].includes('amount') || wcMatch[1].includes('woocommerce') || wcMatch[1].includes('vivenu'))) {
        jsonData.push(wcMatch[1].slice(0, 500))
      }
    })

    // 3. DOM内の料金要素を直接抽出（truncation対策）
    // ultrasignup: .summary-fee-calculation, 一般的な price/fee クラスやテキスト
    const pricingSelectors = [
      '[class*="fee-calculation"], [class*="price-box"], [class*="pricing"]',
      '[class*="entry-fee"], [class*="registration-fee"], [class*="ticket-price"]',
    ]
    for (const sel of pricingSelectors) {
      $(sel).each((_, el) => {
        const text = $(el).text().trim().replace(/\s+/g, ' ')
        if (text && /[\$€£¥₹]\s*[\d,.]+|[\d,.]+\s*(?:円|€|USD|EUR|GBP)/.test(text)) {
          jsonData.push('[DOM pricing] ' + text.slice(0, 200))
        }
      })
    }

    // Remove non-content elements
    $('script, style, svg, iframe, noscript').remove()
    $('nav, header').remove()
    // footer は残す（myraceland.com 等で料金情報が footer 内にある）
    // footer 内の不要要素のみ削除
    $('footer [class*="cookie"], footer [class*="newsletter"], footer [class*="subscribe"]').remove()
    $('[class*="cookie"], [class*="banner"], [class*="popup"], [class*="modal"]').remove()
    $('[class*="newsletter"], [class*="subscribe"]').remove()
    $('[class*="sidebar"], [class*="widget"], [class*="breadcrumb"], [class*="pagination"]').remove()
    $('[class*="ad-"], [class*="ads-"], [id*="ad-"], [id*="ads-"]').remove()
    // Remove HTML comments
    $('*').contents().filter(function() { return this.type === 'comment' }).remove()
    // Remove inline styles and class attributes to reduce noise
    $('[style]').removeAttr('style')
    $('[class]').removeAttr('class')

    // Prefer <main> or <article> content if available
    let $content = $('main').length ? $('main') : $('article').length ? $('article') : $('body')

    // Convert tables to readable text
    $content.find('table').each((_, table) => {
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

    // Preserve headings and list structure
    $content.find('h1, h2, h3, h4, h5, h6').each((_, el) => {
      $(el).prepend('\n## ')
    })
    $content.find('li').each((_, el) => {
      $(el).prepend('- ')
    })

    let text = $content.text().replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()

    // Append extracted JSON pricing data (reserve space within maxChars budget)
    if (jsonData.length) {
      const jsonSection = '\n\n[Extracted pricing data]\n' + jsonData.join('\n')
      const reserved = Math.min(jsonSection.length, 2000)
      const textBudget = maxChars - reserved
      if (text.length > textBudget) {
        text = text.slice(0, textBudget) + '\n[...truncated]'
      }
      text = text + jsonSection
    }

    return text.length <= maxChars ? text : text.slice(0, maxChars) + '\n[...truncated]'
  } catch (e) {
    if (e instanceof RangeError) {
      console.warn('[extractRelevantContent] RangeError:', e.message)
      return null
    }
    throw e
  }
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
      if (absolute === baseUrl) return
      const path = parsed.pathname.toLowerCase()
      const linkText = $(el).text().toLowerCase().trim()
      const matchByPath = RELEVANT_URL_PATTERNS.some((p) => path.includes(p))
      const matchByText = RELEVANT_LINK_TEXT_PATTERNS.some((p) => linkText.includes(p.toLowerCase()))
      if (matchByPath || matchByText) {
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

export async function callLlm(anthropic, systemPrompt, userContent, { maxTokens = 2048, allowEmpty = false } = {}) {
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
      if (!jsonMatch) {
        if (allowEmpty) {
          console.warn(`  [LLM] no JSON found in Tavily result, returning empty result`)
          return { _usage: msg.usage }
        }
        throw new Error('LLM JSON parse error: no JSON found')
      }
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
