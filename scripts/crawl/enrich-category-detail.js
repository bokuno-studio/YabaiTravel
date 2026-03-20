/**
 * ②-B カテゴリ詳細収集スクリプト
 * 1コース1LLM呼び出しで、参加費・制限時間・必携品等を focused に抽出
 *
 * 使い方:
 *   node scripts/crawl/enrich-category-detail.js --event-id <uuid>      # イベントの全カテゴリ
 *   node scripts/crawl/enrich-category-detail.js --category-id <uuid>   # 特定カテゴリ
 *   node scripts/crawl/enrich-category-detail.js --dry-run              # DB更新なし
 */
import pg from 'pg'
import Anthropic from '@anthropic-ai/sdk'
import {
  loadEnv, fetchHtml, extractRelevantContent, extractRelevantLinks,
  callLlm, fetchTavilySearch, isPortalUrl, detectLanguage,
} from './lib/enrich-utils.js'

loadEnv()
const SCHEMA = process.env.SUPABASE_SCHEMA ?? 'yabai_travel'

// --- LLM プロンプト（カテゴリ専用） ---

const CATEGORY_DETAIL_PROMPT = `あなたはレースイベントの情報抽出エキスパートです。
指定されたコース（カテゴリ）の詳細情報のみを JSON 形式で抽出してください。

{
  "entry_fee": "数値（現地通貨、カンマなし。一般枠の標準料金）",
  "entry_fee_currency": "JPY|USD|EUR 等のISO通貨コード",
  "start_time": "HH:MM（wave startの場合は '09:00〜15:00' のように全waveの時間幅）",
  "reception_end": "HH:MM（受付終了時間）",
  "time_limit": "HH:MM:SS（制限時間）",
  "cutoff_times": [{"point": "地点名・関門名", "time": "HH:MM"}],
  "elevation_gain": "数値（累積標高メートル）",
  "mandatory_gear": "必携品リスト",
  "poles_allowed": true/false,
  "itra_points": "数値（ITRAポイント）"
}

ルール:
- ページに記載がない項目は null。推測しない
- entry_fee は1名・一般枠・標準カテゴリの料金（R.LEAGUE割引、早期割引、ペア/チーム料金ではない）
- wave start イベント（HYROX、スパルタン等）: start_time は全 wave の時間幅で返す
- cutoff_times はカットオフ地点ごとに配列
- JSON のみ返す`

const CATEGORY_DETAIL_PROMPT_EN = `You are an expert at extracting race event information.
Extract only the detailed information for the specified course (category) in JSON format.

{
  "entry_fee": "Number (in local currency, no commas. Standard fee for general entry)",
  "entry_fee_currency": "ISO currency code: JPY|USD|EUR etc.",
  "start_time": "HH:MM (if wave start, show full range like '09:00-15:00')",
  "reception_end": "HH:MM (check-in deadline)",
  "time_limit": "HH:MM:SS (time limit / cutoff)",
  "cutoff_times": [{"point": "Checkpoint name", "time": "HH:MM"}],
  "elevation_gain": "Number (cumulative elevation gain in meters)",
  "mandatory_gear": "Mandatory gear list",
  "poles_allowed": true/false,
  "itra_points": "Number (ITRA points)"
}

Rules:
- Use null for items not found on the page. Do not guess
- entry_fee is the standard fee for 1 person, general category (NOT R.LEAGUE discount, early bird, pair/team pricing)
- For wave start events (HYROX, Spartan, etc.): start_time should show the full wave time range
- cutoff_times is an array per checkpoint
- Return JSON only`

/**
 * time_limit の値を PostgreSQL interval 互換の HH:MM:SS 形式にサニタイズ
 * パースできない場合は null を返す
 */
function sanitizeTimeLimit(val) {
  if (!val) return null
  // Already valid HH:MM:SS
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(val)) return val
  // HH:MM format -> add :00
  if (/^\d{1,2}:\d{2}$/.test(val)) return val + ':00'
  // Just hours (e.g., "8", "09") -> HH:00:00
  if (/^\d{1,3}$/.test(val.trim())) {
    const h = parseInt(val.trim(), 10)
    if (h >= 0 && h <= 999) return `${h}:00:00`
    return null
  }
  // "60 minutes" or similar text -> try to parse
  const minMatch = val.match(/(\d+)\s*(?:min|分)/)
  if (minMatch) {
    const m = parseInt(minMatch[1], 10)
    return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:00`
  }
  const hrMatch = val.match(/(\d+)\s*(?:hour|時間|h)/)
  if (hrMatch) {
    return `${parseInt(hrMatch[1], 10)}:00:00`
  }
  return null // unrecognizable format -> skip
}

/**
 * 単一カテゴリの詳細情報を抽出
 * @param {object} event - {id, name, official_url}
 * @param {object} category - {id, name, distance_km}
 * @param {object} opts - {dryRun, html} html は事前取得済みの場合に渡す
 */
export async function enrichCategoryDetail(event, category, opts = { dryRun: false }) {
  const { dryRun = false } = opts
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })

  try {
    await client.connect()
    const { id: eventId, name: eventName, official_url: officialUrl } = event
    const { id: categoryId, name: catName, distance_km: distKm } = category

    const catLabel = `${catName}${distKm ? `(${distKm}km)` : ''}`
    const userMessageJa = `「${eventName}」の${catLabel}コースについて、以下のページ内容から詳細情報を抽出してください。\n\n`
    const userMessageEn = `Extract detailed information for the "${catLabel}" course of "${eventName}" from the following page content:\n\n`

    // --- ステップ1: ページ取得 ---
    let html = opts.html || null
    let fetchedUrl = officialUrl

    if (!html && officialUrl && !isPortalUrl(officialUrl)) {
      try {
        html = await fetchHtml(officialUrl)
      } catch { /* fallback to Tavily */ }
    }

    let extracted = {}
    let totalTokens = 0

    if (html) {
      const content = extractRelevantContent(html)
      if (content.length >= 50) {
        const lang = detectLanguage(content)
        const prompt = lang === 'en' ? CATEGORY_DETAIL_PROMPT_EN : CATEGORY_DETAIL_PROMPT
        const userMsg = lang === 'en' ? userMessageEn : userMessageJa
        const result = await callLlm(anthropic, prompt, userMsg + content)
        totalTokens += (result._usage?.input_tokens || 0) + (result._usage?.output_tokens || 0)
        extracted = result
      }
    } else {
      // Tavily フォールバック
      const query = `${eventName} ${catName} ${distKm || ''}km エントリー 制限時間 必携品`
      const searchResults = await fetchTavilySearch(query)
      for (const content of searchResults) {
        if (content.length < 50) continue
        try {
          const searchLang = detectLanguage(content)
          const prompt = searchLang === 'en' ? CATEGORY_DETAIL_PROMPT_EN : CATEGORY_DETAIL_PROMPT
          const userMsg = searchLang === 'en' ? userMessageEn : userMessageJa
          const result = await callLlm(anthropic, prompt, userMsg + content)
          totalTokens += (result._usage?.input_tokens || 0) + (result._usage?.output_tokens || 0)
          // マージ
          for (const key of Object.keys(result)) {
            if (key === '_usage') continue
            if (result[key] != null && extracted[key] == null) extracted[key] = result[key]
          }
        } catch { /* ignore */ }
      }
    }

    // --- ステップ2: 関連ページ補完 ---
    const needsMore = extracted.entry_fee == null || extracted.time_limit == null || extracted.start_time == null
    if (needsMore && html && fetchedUrl && !isPortalUrl(fetchedUrl)) {
      const relatedLinks = extractRelevantLinks(html, fetchedUrl).slice(0, 3)
      for (const link of relatedLinks) {
        try {
          const linkHtml = await fetchHtml(link)
          const linkContent = extractRelevantContent(linkHtml, 5000)
          if (linkContent.length < 50) continue
          const linkLang = detectLanguage(linkContent)
          const linkPrompt = linkLang === 'en' ? CATEGORY_DETAIL_PROMPT_EN : CATEGORY_DETAIL_PROMPT
          const linkUserMsg = linkLang === 'en' ? userMessageEn : userMessageJa
          const result = await callLlm(anthropic, linkPrompt, linkUserMsg + linkContent)
          totalTokens += (result._usage?.input_tokens || 0) + (result._usage?.output_tokens || 0)
          for (const key of Object.keys(result)) {
            if (key === '_usage') continue
            if (result[key] != null && extracted[key] == null) extracted[key] = result[key]
          }
        } catch { /* ignore */ }
      }
    }

    if (dryRun) {
      console.log(`  DRY catDetail: ${eventName?.slice(0, 25)} / ${catLabel} | fee:${extracted.entry_fee ?? '?'} limit:${extracted.time_limit ?? '?'} tokens:${totalTokens}`)
      return { success: true, categoryId }
    }

    // --- ステップ3: DB 書き込み ---
    const sanitizedTimeLimit = sanitizeTimeLimit(extracted.time_limit)
    const params = [
      categoryId,
      extracted.entry_fee != null ? parseInt(extracted.entry_fee, 10) : null,
      extracted.entry_fee_currency || null,
      extracted.start_time || null,
      extracted.reception_end || null,
      sanitizedTimeLimit,
      extracted.cutoff_times?.length > 0 ? JSON.stringify(extracted.cutoff_times) : null,
      extracted.elevation_gain ?? null,
      extracted.mandatory_gear || null,
      extracted.poles_allowed ?? null,
      extracted.itra_points ?? null,
    ]

    try {
      await client.query(
        `UPDATE ${SCHEMA}.categories SET
          entry_fee          = COALESCE(entry_fee, $2),
          entry_fee_currency = COALESCE(entry_fee_currency, $3),
          start_time         = COALESCE(start_time, $4),
          reception_end      = COALESCE(reception_end, $5),
          time_limit         = COALESCE(time_limit, $6),
          cutoff_times       = CASE WHEN cutoff_times IS NULL OR cutoff_times = '[]'::jsonb THEN $7 ELSE cutoff_times END,
          elevation_gain     = COALESCE(elevation_gain, $8),
          mandatory_gear     = COALESCE(mandatory_gear, $9),
          poles_allowed      = COALESCE(poles_allowed, $10),
          itra_points        = COALESCE(itra_points, $11),
          collected_at       = NOW()
         WHERE id = $1`,
        params
      )
    } catch (dbErr) {
      // INSERT失敗時: 問題のあるフィールドを NULL にしてリトライ
      console.warn(`  [cat-detail] DB write failed, retrying with nullified fields: ${dbErr.message?.slice(0, 80)}`)
      await client.query(
        `UPDATE ${SCHEMA}.categories SET
          entry_fee          = COALESCE(entry_fee, $2),
          entry_fee_currency = COALESCE(entry_fee_currency, $3),
          start_time         = NULL,
          reception_end      = NULL,
          time_limit         = NULL,
          cutoff_times       = CASE WHEN cutoff_times IS NULL OR cutoff_times = '[]'::jsonb THEN $4 ELSE cutoff_times END,
          elevation_gain     = COALESCE(elevation_gain, $5),
          mandatory_gear     = COALESCE(mandatory_gear, $6),
          poles_allowed      = COALESCE(poles_allowed, $7),
          itra_points        = COALESCE(itra_points, $8),
          collected_at       = NOW()
         WHERE id = $1`,
        [
          categoryId,
          params[1],  // entry_fee
          params[2],  // entry_fee_currency
          params[6],  // cutoff_times
          params[7],  // elevation_gain
          params[8],  // mandatory_gear
          params[9],  // poles_allowed
          params[10], // itra_points
        ]
      )
    }

    return { success: true, categoryId }
  } catch (e) {
    return { success: false, categoryId: category.id, error: e.message }
  } finally {
    try { await client.end() } catch { /* ignore */ }
  }
}

// --- CLI ---

async function runCli() {
  const args = process.argv.slice(2)
  const DRY_RUN = args.includes('--dry-run')
  const eventIdIdx = args.indexOf('--event-id')
  const EVENT_ID = eventIdIdx >= 0 ? args[eventIdIdx + 1] : null
  const catIdIdx = args.indexOf('--category-id')
  const CAT_ID = catIdIdx >= 0 ? args[catIdIdx + 1] : null

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  let targets = []

  if (CAT_ID) {
    const { rows } = await client.query(
      `SELECT c.id, c.name, c.distance_km, e.id as event_id, e.name as event_name, e.official_url
       FROM ${SCHEMA}.categories c JOIN ${SCHEMA}.events e ON c.event_id = e.id
       WHERE c.id = $1`,
      [CAT_ID]
    )
    targets = rows.map((r) => ({
      event: { id: r.event_id, name: r.event_name, official_url: r.official_url },
      category: { id: r.id, name: r.name, distance_km: r.distance_km },
    }))
  } else if (EVENT_ID) {
    const { rows: [ev] } = await client.query(
      `SELECT id, name, official_url FROM ${SCHEMA}.events WHERE id = $1`,
      [EVENT_ID]
    )
    if (!ev) { console.log('イベントが見つかりません'); process.exit(1) }
    const { rows: cats } = await client.query(
      `SELECT id, name, distance_km FROM ${SCHEMA}.categories
       WHERE event_id = $1 AND (entry_fee IS NULL OR start_time IS NULL OR time_limit IS NULL)`,
      [EVENT_ID]
    )
    targets = cats.map((c) => ({ event: ev, category: c }))
  }

  await client.end()

  console.log(`対象: ${targets.length} カテゴリ (DRY_RUN: ${DRY_RUN})\n`)
  let ok = 0, err = 0
  for (const { event, category } of targets) {
    const result = await enrichCategoryDetail(event, category, { dryRun: DRY_RUN })
    if (result.success) { ok++; console.log(`  OK  ${event.name?.slice(0, 30)} / ${category.name}`) }
    else { err++; console.log(`  ERR ${event.name?.slice(0, 30)} / ${category.name} | ${result.error?.slice(0, 50)}`) }
  }
  console.log(`\n完了: OK ${ok} / ERR ${err}`)
}

const isDirectRun = process.argv[1]?.includes('enrich-category-detail')
if (isDirectRun) {
  runCli().catch((e) => { console.error(e); process.exit(1) })
}
