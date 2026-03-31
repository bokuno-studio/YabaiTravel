/**
 * ② 詳細情報エンリッチスクリプト
 * events テーブルの collected_at IS NULL なレコードを対象に、
 * 公式ページ + LLM でカテゴリ・詳細情報を収集して DB を更新
 *
 * 使い方:
 *   node scripts/crawl/enrich-detail.js                        # 全未処理件
 *   node scripts/crawl/enrich-detail.js --event-id <uuid>      # 特定イベントのみ
 *   node scripts/crawl/enrich-detail.js --url <url>            # URLで指定
 *   node scripts/crawl/enrich-detail.js --dry-run              # DB更新なし
 *   node scripts/crawl/enrich-detail.js --limit 5              # 最初の5件のみ
 */
import pg from 'pg'
import Anthropic from '@anthropic-ai/sdk'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import * as cheerio from 'cheerio'

const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  })
}

const SCHEMA = process.env.SUPABASE_SCHEMA ?? 'yabai_travel'

const LLM_SYSTEM_PROMPT = `あなたはレースイベントの情報抽出エキスパートです。
与えられた公式ページの内容から、以下の JSON 形式で情報を抽出してください。

{
  "event": {
    "name": "正式な大会名",
    "event_date": "YYYY-MM-DD（開催初日）",
    "event_date_end": "YYYY-MM-DD（複数日の場合の最終日）",
    "location": "開催地。日本国内なら「○○県○○市」「○○市○○町」等の地名。海外なら「都市名, 国名」。会場施設名のみの場合でも必ず自治体名を含めること。例: 長野県長野市、富山県高岡市、Chamonix-Mont-Blanc, France",
    "country": "国名（日本語）。日本なら「日本」",
    "race_type": "以下の分類基準に従って判定。marathon: ロードレース・マラソン・ハーフマラソン・リレーマラソン・ファンラン・ウルトラマラソン等の舗装路ランニング大会 | trail: トレイルランニング・山岳レース・ウルトラトレイル等の未舗装路ランニング大会 | triathlon: トライアスロン（スイム+バイク+ラン）・アクアスロン | bike: 自転車レース・クリテリウム・ヒルクライム・ロングライド・グラベル・エンデューロ（自転車）・サイクルフェスタ | duathlon: デュアスロン（ラン+バイク+ラン） | rogaining: ロゲイニング・フォトロゲ | spartan: スパルタンレース | hyrox: HYROX | obstacle: OCR・障害物レース（スパルタン・HYROX以外） | adventure: アドベンチャーレース | devils_circuit: Devils Circuit | strong_viking: Strong Viking | other: 上記に該当しない場合のみ",
    "official_url": "大会の公式サイトURL（ポータルサイトや申込サイトではなく、主催者の公式ページURL）",
    "entry_url": "申込URL（あれば）",
    "entry_start": "YYYY-MM-DD（申込開始日）",
    "entry_end": "YYYY-MM-DD（申込終了日）",
    "reception_place": "受付場所",
    "start_place": "スタート場所",
    "weather_forecast": "開催時期の気候。気温範囲・天候の傾向・推奨装備を簡潔に記述（例: 4月上旬、気温5〜15℃、晴れが多い。防寒着推奨）",
    "visa_info": "海外レースの場合、日本人に必要なビザ情報（例: ビザ不要（90日以内）、要観光ビザ等）。日本国内レースはnull",
    "recovery_facilities": "会場周辺の温泉・スパ・銭湯・マッサージ等のリカバリー施設（例: ○○温泉（会場から車10分）、△△スパ）",
    "photo_spots": "会場周辺のフォトスポット・観光名所（例: ○○展望台、△△神社）"
  },
  "categories": [
    {
      "name": "カテゴリ名",
      "distance_km": 数値,
      "elevation_gain": 数値（メートル）,
      "entry_fee": 数値（現地通貨で、カンマなし）,
      "entry_fee_currency": "JPY|USD|EUR 等のISO通貨コード",
      "start_time": "HH:MM",
      "reception_end": "HH:MM（受付終了時間）",
      "time_limit": "HH:MM:SS",
      "cutoff_times": [{"point": "地点名・関門名", "time": "HH:MM"}],
      "mandatory_gear": "必携品リスト",
      "poles_allowed": true/false,
      "itra_points": 数値（ITRAポイント数）
    }
  ]
}

ルール:
- ページに記載がない項目は null にする。推測しない
- 日付は YYYY-MM-DD 形式
- entry_fee は現地通貨の数値。¥5000 → 5000 + "JPY"、$129 → 129 + "USD"、€85 → 85 + "EUR"
- cutoff_times はカットオフ地点ごとに配列で抽出する
- itra_points は ITRA ポイントの数値のみ（例: "ITRA2" → 2）
- categories は記載されている全カテゴリ
- JSON のみ返す`

// 追加ページを探索するための関連URLパターン
const RELEVANT_URL_PATTERNS = [
  '/schedule', '/about', '/course', '/entry', '/rule', '/access',
  '/info', '/detail', '/category', '/distance', '/fee', '/registration',
  '/gear', '/equipment', '/transport', '/location', '/venue', '/map',
]

// アグリゲータ・SNS 等の外部リンクは公式サイトとして扱わない
const AGGREGATOR_DOMAINS = [
  'runnet.jp', 'sports-entry.com', 'lawson-do.jp', 'l-tike.com', 'facebook.com',
  'twitter.com', 'x.com', 'instagram.com', 'youtube.com', 'adobe.com',
  'apple.com', 'google.com', 'line.me', 'amazon.co.jp',
]

async function fetchHtml(url, timeoutMs = 15000) {
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
      // タイムアウト・接続エラーは1回リトライ（3秒待機）
      if (attempt === 0 && (e.name === 'AbortError' || e.code === 'ECONNREFUSED' || e.code === 'ECONNRESET')) {
        await new Promise((r) => setTimeout(r, 3000))
        continue
      }
      throw e
    }
  }
}

/** HTML からコンテンツを抽出（テーブルの構造も保持） */
function extractRelevantContent(html, maxChars = 10000) {
  const $ = cheerio.load(html)
  $('script, style, svg, iframe, noscript').remove()
  $('[class*="cookie"], [class*="banner"], [class*="popup"], [class*="modal"]').remove()
  $('[class*="newsletter"], [class*="subscribe"]').remove()

  // テーブルを読みやすいテキストに変換（構造を保持）
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

/** HTML からアグリゲータ以外の外部公式サイトリンクを抽出 */
function extractExternalOfficialLinks(html, baseUrl) {
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

/** HTML から同一ドメインの関連リンクを抽出 */
function extractRelevantLinks(html, baseUrl) {
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

async function callLlm(anthropic, pageContent, raceName) {
  let lastError
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: [{ type: 'text', text: LLM_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: `「${raceName}」の公式ページ内容:\n\n${pageContent}` }],
      })
      const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('LLM JSON parse error: no JSON found')
      return { ...JSON.parse(jsonMatch[0]), _usage: msg.usage }
    } catch (e) {
      lastError = e
      // クレジット残高不足
      if (e.status === 400 && e.error?.error?.message?.includes('credit')) {
        throw new Error(`Anthropic クレジット残高不足: ${e.error.error.message}`)
      }
      // レート制限: 60秒待機してリトライ
      if (attempt === 0 && e.status === 429) {
        console.warn(`  [LLM] 429 rate limit、60秒待機してリトライ...`)
        await new Promise((r) => setTimeout(r, 60000))
        continue
      }
      // JSONパースエラー: 即リトライ
      if (attempt === 0 && (e.message?.includes('JSON') || e.message?.includes('parse') || e instanceof SyntaxError)) {
        continue
      }
      throw e
    }
  }
  throw lastError
}

/** カテゴリ名を正規化（英語/日本語/距離表記の揺れを吸収） */
function normalizeCategoryName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/\d+\.?\d*\s*(km|k)\b/g, '')  // 距離表記を除去
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

/** 名前のゆれを考慮してカテゴリを検索 */
function findMatchingCategory(categories, targetName) {
  const norm = normalizeCategoryName(targetName)
  if (!norm) return null

  // 1. 正規化後の完全一致
  let match = categories.find((c) => normalizeCategoryName(c.name) === norm)
  if (match) return match

  // 2. 部分一致（どちらかが含む）
  match = categories.find((c) => {
    const cn = normalizeCategoryName(c.name)
    return cn.includes(norm) || norm.includes(cn)
  })
  if (match) return match

  // 3. エイリアスグループで一致
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

/** Tavily で Web 検索して関連コンテンツを取得 */
async function fetchTavilySearch(query, { includeUrls = false } = {}) {
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

/** ポータルサイトのURLかどうかを判定 */
const PORTAL_DOMAINS = ['sportsentry.ne.jp', 'runnet.jp', 'do.l-tike.com', 'l-tike.com', 'moshicom.com']
function isPortalUrl(url) {
  if (!url) return false
  return PORTAL_DOMAINS.some((d) => url.includes(d))
}

/** race_type 有効値リスト */
const VALID_RACE_TYPES = [
  'marathon', 'trail', 'triathlon', 'bike', 'duathlon', 'rogaining',
  'spartan', 'hyrox', 'obstacle', 'adventure', 'devils_circuit', 'strong_viking',
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

/**
 * パス0: race_type 再分類
 * race_type が other のイベントに対し、イベント名ベースで LLM に再分類させる
 */
async function reclassifyRaceType(anthropic, eventName) {
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 32,
      system: [{ type: 'text', text: RACE_TYPE_CLASSIFY_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: eventName }],
    })
    const text = (msg.content[0].type === 'text' ? msg.content[0].text : '').trim().toLowerCase()
    if (VALID_RACE_TYPES.includes(text)) return text
    // "other" またはパースできない場合は null（変更なし）
    return null
  } catch {
    return null
  }
}

/** 高優先度フィールドが欠けているか判定 */
function hasMissingFields(categories, raceType = null) {
  if (!categories || categories.length === 0) return true
  return categories.some((c) => {
    const missingBasic =
      c.distance_km == null ||
      c.entry_fee == null ||
      c.start_time == null ||
      c.reception_end == null ||
      c.cutoff_times == null ||
      (Array.isArray(c.cutoff_times) && c.cutoff_times.length === 0 && c.distance_km > 20)

    // poles_allowed は trail または ultra race_type のみ必須
    const missingPoles = (raceType === 'trail' || raceType === 'ultra') && c.poles_allowed == null

    return missingBasic || missingPoles
  })
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || `https://${process.env.SUPABASE_PROJECT_REF || 'wzkjnmowrlfgvkuzyiio'}.supabase.co`
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

/** コースマップ画像/PDFのURLパターン */
const COURSE_MAP_PATTERNS = /course[-_]?map|コースマップ|コース図|course[-_]?profile|elevation[-_]?profile|高低図|標高図/i
const COURSE_MAP_FILE_EXT = /\.(png|jpe?g|gif|webp|pdf|svg)(\?|$)/i

/** HTMLからコースマップのURLを検出し、Supabase Storageに保存 */
async function extractAndSaveCourseMap(html, baseUrl, eventId, dbClient) {
  if (!SUPABASE_SERVICE_KEY) return

  const $ = cheerio.load(html)
  const candidates = new Set()

  // img タグからコースマップを検出
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

  // a タグからコースマップPDF/画像リンクを検出
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

  // 既存レコード確認
  const existing = await dbClient.query(
    `SELECT file_path FROM ${SCHEMA}.course_map_files WHERE event_id = $1`,
    [eventId]
  )
  if (existing.rows.length > 0) return // 既にある場合はスキップ

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
      if (buffer.length < 1000 || buffer.length > 10 * 1024 * 1024) continue // 1KB〜10MB

      const ext = mapUrl.match(/\.(png|jpe?g|gif|webp|pdf|svg)/i)?.[1]?.toLowerCase() || 'png'
      const storagePath = `${eventId}/${Date.now()}.${ext}`

      // Supabase Storage にアップロード
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

      // DB にレコード保存
      const year = new Date().getFullYear()
      const displayName = new URL(mapUrl).pathname.split('/').pop() || `course-map.${ext}`
      await dbClient.query(
        `INSERT INTO ${SCHEMA}.course_map_files (event_id, file_path, year, display_name) VALUES ($1, $2, $3, $4)`,
        [eventId, storagePath, year, displayName]
      )
      saved++
      console.log(`  [course-map] OK ${storagePath}`)
    } catch { /* ignore individual failures */ }
  }
}

/**
 * 単一イベントをエンリッチする
 * @param {object} event - {id, name, official_url, location, country}
 * @param {object} opts - {dryRun: boolean}
 * @returns {Promise<{success: boolean, eventId: string, error?: string}>}
 */
export async function enrichDetail(event, opts = { dryRun: false }) {
  const { dryRun = false } = opts
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })

  try {
    await client.connect()

    const { id: eventId, name, official_url: officialUrl } = event

    // ポータルURL or official_url なし → Tavily フォールバック必須
    const needsTavilyLookup = !officialUrl || isPortalUrl(officialUrl)

    // Pass 1: 公式ページ取得 + LLM 抽出
    let html
    let fetchFailed = needsTavilyLookup  // ポータルURLの場合は最初からTavilyへ
    if (!needsTavilyLookup) {
      try {
        html = await fetchHtml(officialUrl)
      } catch (e) {
        const status = parseInt(e.message, 10)
        // 403/404 等の場合は Tavily フォールバックへ
        if (status === 403 || status === 404 || status === 429) {
          fetchFailed = true
          console.log(`  [fallback] ${name?.slice(0, 40)} | ${e.message} → Tavily検索`)
        } else {
          return { success: false, eventId, error: `fetch failed: ${e.message}` }
        }
      }
    } else {
      console.log(`  [tavily] ${name?.slice(0, 40)} | official_url=${officialUrl?.slice(0, 40) || '(なし)'} → Tavily検索`)
    }

    let extracted = { event: {}, categories: [] }
    let totalTokens = 0

    if (!fetchFailed) {
      const content = extractRelevantContent(html)
      if (content.length < 50) {
        return { success: false, eventId, error: 'page content too short' }
      }
      extracted = await callLlm(anthropic, content, name)
      totalTokens = (extracted._usage?.input_tokens || 0) + (extracted._usage?.output_tokens || 0)
    } else {
      // Tavily フォールバック: レース名で検索して LLM 抽出
      const query = `${name} 公式サイト エントリー 開催日 距離`
      const searchResults = await fetchTavilySearch(query, { includeUrls: true })
      if (searchResults.length === 0) {
        return { success: false, eventId, error: `fetch failed (fallback: no search results)` }
      }
      // Tavily結果のURLから公式サイト候補を特定
      let discoveredOfficialUrl = null
      for (const result of searchResults) {
        if (result.url && !isPortalUrl(result.url) && !AGGREGATOR_DOMAINS.some((d) => result.url.includes(d))) {
          discoveredOfficialUrl = discoveredOfficialUrl || result.url
        }
      }
      for (const result of searchResults) {
        if (result.content.length < 50) continue
        try {
          const searchExtracted = await callLlm(anthropic, result.content, name)
          totalTokens += (searchExtracted._usage?.input_tokens || 0) + (searchExtracted._usage?.output_tokens || 0)

          const ae = searchExtracted.event || {}
          const e = extracted.event || {}
          extracted.event = {
            official_url:    e.official_url    ?? ae.official_url,
            name:            e.name            ?? ae.name,
            event_date:      e.event_date      ?? ae.event_date,
            event_date_end:  e.event_date_end  ?? ae.event_date_end,
            location:        e.location        ?? ae.location,
            country:         e.country         ?? ae.country,
            race_type:       e.race_type       ?? ae.race_type,
            entry_url:       e.entry_url       ?? ae.entry_url,
            entry_start:     e.entry_start     ?? ae.entry_start,
            entry_end:       e.entry_end       ?? ae.entry_end,
            reception_place: e.reception_place ?? ae.reception_place,
            start_place:     e.start_place     ?? ae.start_place,
            weather_forecast:    e.weather_forecast    ?? ae.weather_forecast,
            visa_info:           e.visa_info           ?? ae.visa_info,
            recovery_facilities: e.recovery_facilities ?? ae.recovery_facilities,
            photo_spots:         e.photo_spots         ?? ae.photo_spots,
          }

          if (searchExtracted.categories?.length > 0) {
            if (!extracted.categories || extracted.categories.length === 0) {
              extracted.categories = searchExtracted.categories
            } else {
              for (const addCat of searchExtracted.categories) {
                const existing = findMatchingCategory(extracted.categories, addCat.name)
                if (existing) {
                  existing.distance_km        = existing.distance_km        ?? addCat.distance_km
                  existing.elevation_gain     = existing.elevation_gain     ?? addCat.elevation_gain
                  existing.entry_fee          = existing.entry_fee          ?? addCat.entry_fee
                  existing.entry_fee_currency = existing.entry_fee_currency ?? addCat.entry_fee_currency
                  existing.start_time         = existing.start_time         ?? addCat.start_time
                  existing.reception_end      = existing.reception_end      ?? addCat.reception_end
                  existing.time_limit         = existing.time_limit         ?? addCat.time_limit
                  existing.cutoff_times       = (existing.cutoff_times?.length > 0) ? existing.cutoff_times : addCat.cutoff_times
                  existing.mandatory_gear     = existing.mandatory_gear     ?? addCat.mandatory_gear
                  existing.poles_allowed      = existing.poles_allowed      ?? addCat.poles_allowed
                  existing.itra_points        = existing.itra_points        ?? addCat.itra_points
                }
              }
            }
          }
        } catch { /* 検索結果の処理失敗は無視 */ }
      }
      // LLM抽出またはTavily結果URLから公式URLを確定
      if (!extracted.event.official_url && discoveredOfficialUrl) {
        extracted.event.official_url = discoveredOfficialUrl
      }
      console.log(`  [tavily] ${name?.slice(0, 40)} | ${searchResults.length}件で補完${extracted.event.official_url ? ' | 公式URL特定: ' + extracted.event.official_url.slice(0, 50) : ''}`)
    }

    // Pass 2: 関連ページ探索（同一ドメインのサブページ + 外部公式サイトとそのサブページ）
    // Tavilyフォールバック時はHTMLが無いためスキップ
    if (fetchFailed) {
      // Pass 2/3 をスキップして直接DB更新へ
    } else {
    const internalLinks = extractRelevantLinks(html, officialUrl)

    // 外部公式サイト（runnet等から race 公式サイトへのリンク）とそのサブページを追加
    const externalOfficialLinks = extractExternalOfficialLinks(html, officialUrl)
    const externalSubLinks = []
    for (const extUrl of externalOfficialLinks) {
      externalSubLinks.push(extUrl)
      try {
        const extHtml = await fetchHtml(extUrl)
        const subLinks = extractRelevantLinks(extHtml, extUrl)
        externalSubLinks.push(...subLinks.slice(0, 4))
      } catch { /* ignore */ }
    }

    const links = [...internalLinks.slice(0, 3), ...externalSubLinks.slice(0, 7)]
    for (const link of links) {
      try {
        const additionalHtml = await fetchHtml(link)
        const additionalContent = extractRelevantContent(additionalHtml)
        if (additionalContent.length < 50) continue

        const additionalExtracted = await callLlm(anthropic, additionalContent, name)
        totalTokens += (additionalExtracted._usage?.input_tokens || 0) + (additionalExtracted._usage?.output_tokens || 0)

        // event フィールドのマージ（null のみ上書き）
        const ae = additionalExtracted.event || {}
        const e = extracted.event || {}
        extracted.event = {
          name:            e.name            ?? ae.name,
          event_date:      e.event_date      ?? ae.event_date,
          event_date_end:  e.event_date_end  ?? ae.event_date_end,
          location:        e.location        ?? ae.location,
          country:         e.country         ?? ae.country,
          race_type:       e.race_type       ?? ae.race_type,
          entry_url:       e.entry_url       ?? ae.entry_url,
          entry_start:     e.entry_start     ?? ae.entry_start,
          entry_end:       e.entry_end       ?? ae.entry_end,
          reception_place: e.reception_place ?? ae.reception_place,
          start_place:     e.start_place     ?? ae.start_place,
        }

        // カテゴリのマージ（名前のゆれを吸収して欠落フィールドを補完）
        if (additionalExtracted.categories?.length > 0) {
          if (!extracted.categories || extracted.categories.length === 0) {
            extracted.categories = additionalExtracted.categories
          } else {
            for (const addCat of additionalExtracted.categories) {
              const existing = findMatchingCategory(extracted.categories, addCat.name)
              if (existing) {
                existing.distance_km        = existing.distance_km        ?? addCat.distance_km
                existing.elevation_gain     = existing.elevation_gain     ?? addCat.elevation_gain
                existing.entry_fee          = existing.entry_fee          ?? addCat.entry_fee
                existing.entry_fee_currency = existing.entry_fee_currency ?? addCat.entry_fee_currency
                existing.start_time         = existing.start_time         ?? addCat.start_time
                existing.reception_end      = existing.reception_end      ?? addCat.reception_end
                existing.time_limit         = existing.time_limit         ?? addCat.time_limit
                existing.cutoff_times       = (existing.cutoff_times?.length > 0) ? existing.cutoff_times : addCat.cutoff_times
                existing.mandatory_gear     = existing.mandatory_gear     ?? addCat.mandatory_gear
                existing.poles_allowed      = existing.poles_allowed      ?? addCat.poles_allowed
                existing.itra_points        = existing.itra_points        ?? addCat.itra_points
              }
            }
          }
        }
      } catch { /* 追加ページ失敗は無視 */ }
    }

    // Pass 3: 欠落フィールドが残っている場合のみ Tavily で Web 検索して補完
    if (hasMissingFields(extracted.categories, extracted.event.race_type)) {
      const query = `${name} エントリー料金 距離 開催日 制限時間`
      const searchResults = await fetchTavilySearch(query)
      for (const content of searchResults) {
        if (content.length < 50) continue
        try {
          const searchExtracted = await callLlm(anthropic, content, name)
          totalTokens += (searchExtracted._usage?.input_tokens || 0) + (searchExtracted._usage?.output_tokens || 0)

          const ae = searchExtracted.event || {}
          const e = extracted.event || {}
          extracted.event = {
            name:            e.name            ?? ae.name,
            event_date:      e.event_date      ?? ae.event_date,
            event_date_end:  e.event_date_end  ?? ae.event_date_end,
            location:        e.location        ?? ae.location,
            country:         e.country         ?? ae.country,
            race_type:       e.race_type       ?? ae.race_type,
            entry_url:       e.entry_url       ?? ae.entry_url,
            entry_start:     e.entry_start     ?? ae.entry_start,
            entry_end:       e.entry_end       ?? ae.entry_end,
            reception_place: e.reception_place ?? ae.reception_place,
            start_place:     e.start_place     ?? ae.start_place,
            weather_forecast:    e.weather_forecast    ?? ae.weather_forecast,
            visa_info:           e.visa_info           ?? ae.visa_info,
            recovery_facilities: e.recovery_facilities ?? ae.recovery_facilities,
            photo_spots:         e.photo_spots         ?? ae.photo_spots,
          }

          if (searchExtracted.categories?.length > 0) {
            if (!extracted.categories || extracted.categories.length === 0) {
              extracted.categories = searchExtracted.categories
            } else {
              for (const addCat of searchExtracted.categories) {
                const existing = findMatchingCategory(extracted.categories, addCat.name)
                if (existing) {
                  existing.distance_km        = existing.distance_km        ?? addCat.distance_km
                  existing.elevation_gain     = existing.elevation_gain     ?? addCat.elevation_gain
                  existing.entry_fee          = existing.entry_fee          ?? addCat.entry_fee
                  existing.entry_fee_currency = existing.entry_fee_currency ?? addCat.entry_fee_currency
                  existing.start_time         = existing.start_time         ?? addCat.start_time
                  existing.reception_end      = existing.reception_end      ?? addCat.reception_end
                  existing.time_limit         = existing.time_limit         ?? addCat.time_limit
                  existing.cutoff_times       = (existing.cutoff_times?.length > 0) ? existing.cutoff_times : addCat.cutoff_times
                  existing.mandatory_gear     = existing.mandatory_gear     ?? addCat.mandatory_gear
                  existing.poles_allowed      = existing.poles_allowed      ?? addCat.poles_allowed
                  existing.itra_points        = existing.itra_points        ?? addCat.itra_points
                }
              }
            }
          }
        } catch { /* 検索結果の処理失敗は無視 */ }
      }
    }
    } // end of !fetchFailed block

    if (dryRun) {
      console.log(`  DRY enrichDetail: ${name?.slice(0, 40)} | cats:${extracted.categories?.length ?? 0} | tokens:${totalTokens}`)
      return { success: true, eventId }
    }

    const e = extracted.event || {}

    // パス0: race_type 再分類 — LLM 抽出結果が other の場合、イベント名で専用再分類
    let finalRaceType = e.race_type || null
    if (!finalRaceType || finalRaceType === 'other') {
      const reclassified = await reclassifyRaceType(anthropic, name)
      if (reclassified) {
        finalRaceType = reclassified
        console.log(`  [reclassify] ${name?.slice(0, 40)} | other → ${reclassified}`)
      }
    }

    // official_url の更新: ポータルURLから実際の公式URLに置換
    const newOfficialUrl = e.official_url && !isPortalUrl(e.official_url) ? e.official_url : null
    // ポータルURL洗替対象かどうか（official_url/event_date は上書き許可）
    const isPortalReplace = isPortalUrl(officialUrl)

    // events テーブル更新（COALESCE で null フィールドのみ更新、ポータル洗替時は上書き）
    await client.query(
      `UPDATE ${SCHEMA}.events SET
        name            = COALESCE(name, $1),
        event_date      = ${isPortalReplace ? 'COALESCE($2, event_date)' : 'COALESCE(event_date, $2)'},
        location        = COALESCE(location, $3),
        country         = COALESCE(country, $4),
        race_type       = CASE WHEN race_type IS NULL OR race_type = 'other' THEN COALESCE($5, race_type) ELSE race_type END,
        entry_url       = COALESCE(entry_url, $6),
        entry_start     = COALESCE(entry_start, $7),
        entry_end       = COALESCE(entry_end, $8),
        reception_place = COALESCE(reception_place, $9),
        start_place     = COALESCE(start_place, $10),
        weather_forecast     = COALESCE(weather_forecast, $11),
        visa_info            = COALESCE(visa_info, $12),
        recovery_facilities  = COALESCE(recovery_facilities, $13),
        photo_spots          = COALESCE(photo_spots, $14),
        official_url    = ${isPortalReplace ? 'COALESCE($15, official_url)' : 'COALESCE(official_url, $15)'}
       WHERE id = $16`,
      [
        e.name           || null,
        e.event_date     || null,
        e.location       || null,
        e.country        || null,
        finalRaceType    || null,
        e.entry_url      || null,
        e.entry_start    || null,
        e.entry_end      || null,
        e.reception_place || null,
        e.start_place    || null,
        e.weather_forecast    || null,
        e.visa_info           || null,
        e.recovery_facilities || null,
        e.photo_spots         || null,
        newOfficialUrl,
        eventId,
      ]
    )

    // categories: 既存は空フィールドのみ COALESCE UPDATE、新規は INSERT
    for (const cat of extracted.categories || []) {
      if (!cat.name) continue
      const exists = await client.query(
        `SELECT id FROM ${SCHEMA}.categories WHERE event_id = $1 AND name = $2`,
        [eventId, cat.name]
      )

      if (exists.rows.length > 0) {
        // 既存カテゴリ: 空フィールドのみ補完
        await client.query(
          `UPDATE ${SCHEMA}.categories SET
            distance_km        = COALESCE(distance_km, $2),
            elevation_gain     = COALESCE(elevation_gain, $3),
            entry_fee          = COALESCE(entry_fee, $4),
            entry_fee_currency = COALESCE(entry_fee_currency, $5),
            start_time         = COALESCE(start_time, $6),
            reception_end      = COALESCE(reception_end, $7),
            time_limit         = COALESCE(time_limit, $8),
            cutoff_times       = CASE WHEN cutoff_times IS NULL OR cutoff_times = '[]'::jsonb THEN $9 ELSE cutoff_times END,
            mandatory_gear     = COALESCE(mandatory_gear, $10),
            poles_allowed      = COALESCE(poles_allowed, $11),
            itra_points        = COALESCE(itra_points, $12)
           WHERE id = $1`,
          [
            exists.rows[0].id,
            cat.distance_km        ?? null,
            cat.elevation_gain     ?? null,
            cat.entry_fee != null  ? parseInt(cat.entry_fee, 10) : null,
            cat.entry_fee_currency || null,
            cat.start_time         || null,
            cat.reception_end      || null,
            cat.time_limit         || null,
            cat.cutoff_times?.length > 0 ? JSON.stringify(cat.cutoff_times) : null,
            cat.mandatory_gear     || null,
            cat.poles_allowed      ?? null,
            cat.itra_points        ?? null,
          ]
        )
      } else {
        // 新規カテゴリ: INSERT
        await client.query(
          `INSERT INTO ${SCHEMA}.categories
            (event_id, name, distance_km, elevation_gain, entry_fee, entry_fee_currency,
             start_time, reception_end, time_limit, cutoff_times, mandatory_gear, poles_allowed, itra_points)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            eventId,
            cat.name,
            cat.distance_km        ?? null,
            cat.elevation_gain     ?? null,
            cat.entry_fee != null  ? parseInt(cat.entry_fee, 10) : null,
            cat.entry_fee_currency || null,
            cat.start_time         || null,
            cat.reception_end      || null,
            cat.time_limit         || null,
            cat.cutoff_times?.length > 0 ? JSON.stringify(cat.cutoff_times) : null,
            cat.mandatory_gear     || null,
            cat.poles_allowed      ?? null,
            cat.itra_points        ?? null,
          ]
        )
      }
    }

    // コースマップの検出・保存（HTMLが取得できている場合のみ）
    if (!fetchFailed && html) {
      try {
        await extractAndSaveCourseMap(html, officialUrl, eventId, client)
      } catch (err) {
        console.log(`  [course-map] ERR ${name?.slice(0, 40)} | ${err.message?.slice(0, 50)}`)
      }
    }

    // collected_at と last_attempted_at を更新
    await client.query(
      `UPDATE ${SCHEMA}.events SET collected_at = NOW(), last_attempted_at = NOW() WHERE id = $1`,
      [eventId]
    )

    return { success: true, eventId, location: e.location || null }
  } catch (e) {
    // 失敗時も last_attempted_at を更新してループを防ぐ
    try {
      await client.query(
        `UPDATE ${SCHEMA}.events SET last_attempted_at = NOW() WHERE id = $1`,
        [event.id]
      )
    } catch { /* ignore */ }
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
  const urlIdx = args.indexOf('--url')
  const URL_ARG = urlIdx >= 0 ? args[urlIdx + 1] : null

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  let targets

  if (EVENT_ID) {
    const { rows } = await client.query(
      `SELECT id, name, official_url, location, country FROM ${SCHEMA}.events WHERE id = $1`,
      [EVENT_ID]
    )
    targets = rows
  } else if (URL_ARG) {
    const { rows } = await client.query(
      `SELECT id, name, official_url, location, country FROM ${SCHEMA}.events WHERE official_url = $1`,
      [URL_ARG]
    )
    targets = rows
  } else {
    const { rows } = await client.query(
      `SELECT id, name, official_url, location, country FROM ${SCHEMA}.events WHERE collected_at IS NULL ORDER BY updated_at ASC LIMIT $1`,
      [LIMIT === Infinity ? 10000 : LIMIT]
    )
    targets = rows
  }

  await client.end()

  console.log(`=== 詳細エンリッチ開始 (DRY_RUN: ${DRY_RUN}, 件数: ${targets.length}) ===\n`)

  let ok = 0, errors = 0

  for (let i = 0; i < targets.length; i++) {
    const event = targets[i]
    const label = `[${i + 1}/${targets.length}]`

    const result = await enrichDetail(event, { dryRun: DRY_RUN })
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

if (process.argv[1]?.endsWith('enrich-detail.js')) {
  runCli().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
