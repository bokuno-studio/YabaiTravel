/**
 * ②-B カテゴリ詳細収集スクリプト
 * 1コース1LLM呼び出しで、参加費・制限時間・必携品等を日英同時に抽出
 *
 * 使い方:
 *   node scripts/crawl/enrich-category-detail.js --event-id <uuid>      # イベントの全カテゴリ
 *   node scripts/crawl/enrich-category-detail.js --category-id <uuid>   # 特定カテゴリ
 *   node scripts/crawl/enrich-category-detail.js --dry-run              # DB更新なし
 *   node scripts/crawl/enrich-category-detail.js --batch               # Batch API 使用（50%コスト削減）
 *   node scripts/crawl/enrich-category-detail.js --batch --event-id <uuid>  # バッチ + イベント指定
 */
import pg from 'pg'
import Anthropic from '@anthropic-ai/sdk'
import {
  loadEnv, fetchHtml, extractRelevantContent, extractRelevantLinks,
  callLlm, fetchTavilySearch, isPortalUrl,
} from './lib/enrich-utils.js'
import { runBatch } from './lib/batch-utils.js'

loadEnv()
const SCHEMA = process.env.SUPABASE_SCHEMA ?? 'yabai_travel'

// --- 必須フィールドテンプレート ---
// 共通テンプレート: 全種別で必須
const COMMON_REQUIRED_FIELDS = ['entry_fee']
// 種別テンプレート: race_type ごとに追加（#318 で順次追加）
const PER_RACE_TYPE_REQUIRED_FIELDS = {
  // trail: ['time_limit', 'elevation_gain', 'mandatory_gear', 'cutoff_times'],
  // marathon: ['time_limit', 'start_time'],
}

/** race_type に応じた必須フィールドリストを返す */
function getRequiredFields(raceType) {
  const raceFields = PER_RACE_TYPE_REQUIRED_FIELDS[raceType] || []
  return [...new Set([...COMMON_REQUIRED_FIELDS, ...raceFields])]
}

/** 必須フィールドがすべて埋まっているか判定 */
function isRequiredFieldsFilled(extracted, requiredFields) {
  return requiredFields.every(field => extracted[field] != null)
}

// --- LLM プロンプト（統一バイリンガル） ---

const CATEGORY_DETAIL_PROMPT = `You are an expert at extracting race event information.
Extract the detailed information for the specified course (category) in JSON format.
Provide BOTH Japanese and English for text fields.

{
  "entry_fee": "Number (in local currency, no commas. Standard fee for general entry)",
  "entry_fee_currency": "ISO currency code: JPY|USD|EUR etc.",
  "start_time": "HH:MM (if wave start, show full range like '09:00-15:00')",
  "reception_end": "HH:MM (check-in deadline)",
  "time_limit": "HH:MM:SS (time limit / cutoff)",
  "cutoff_times": [{"point": "Checkpoint name", "point_en": "Checkpoint name in English", "time": "HH:MM"}],
  "elevation_gain": "Number (cumulative elevation gain in meters)",
  "mandatory_gear": "必携品リスト（Japanese）",
  "mandatory_gear_en": "Mandatory gear list (English)",
  "recommended_gear": "推奨装備（Japanese）",
  "recommended_gear_en": "Recommended gear (English)",
  "prohibited_items": "使用禁止品（Japanese）",
  "prohibited_items_en": "Prohibited items (English)",
  "reception_place": "受付場所（Japanese）",
  "reception_place_en": "Check-in location (English)",
  "start_place": "スタート地点（Japanese）",
  "start_place_en": "Start location (English)",
  "poles_allowed": true/false,
  "itra_points": "Number (ITRA points)",
  "finish_rate": "Number (0-100, finish rate percentage)"
}

Rules:
- Use null for items not found on the page. Do not guess
- entry_fee is the standard fee for 1 person, general category (NOT R.LEAGUE discount, early bird, pair/team pricing)
- For wave start events (HYROX, Spartan, etc.): start_time should show the full wave time range
- cutoff_times is an array per checkpoint
- For Japanese text fields, provide the original Japanese. For English, translate or use the original if already English
- Return JSON only`

/**
 * start_time / reception_end のサニタイズ（TEXT型カラム）
 * - TBA/TBC/未定 → null
 * - Wave range "08:00-20:30" → そのまま保存
 * - パースできない場合は null を返す
 */
function sanitizeTime(val) {
  if (!val) return null
  const s = String(val).trim()
  // TBA / TBC → null
  if (/^(TBA|TBC|tba|tbc|未定)$/i.test(s)) return null
  // Wave range pattern "HH:MM-HH:MM" → そのまま保存
  if (/^\d{1,2}:\d{2}\s*[-–~〜]\s*\d{1,2}:\d{2}$/.test(s)) return s
  // Valid HH:MM or HH:MM:SS
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) return s
  return null
}

/**
 * time_limit の値を PostgreSQL interval 互換の HH:MM:SS 形式にサニタイズ
 * パースできない場合は null を返す
 */
function sanitizeTimeLimit(val) {
  if (!val) return null
  // TBA / TBC → null
  if (/^(TBA|TBC|tba|tbc|未定)$/i.test(String(val).trim())) return null
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
 * @param {object} event - {id, name, official_url, race_type}
 * @param {object} category - {id, name, distance_km}
 * @param {object} opts - {dryRun, html, _batchResult} _batchResult は Batch API の結果を注入（内部用）
 */
export async function enrichCategoryDetail(event, category, opts = { dryRun: false }) {
  const { dryRun = false, _batchResult = null } = opts
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })

  try {
    await client.connect()
    const { id: eventId, name: eventName, official_url: officialUrl, race_type: raceType } = event
    const { id: categoryId, name: catName, distance_km: distKm } = category

    const catLabel = `${catName}${distKm ? `(${distKm}km)` : ''}`
    const userMessage = `Extract detailed information for the "${catLabel}" course of "${eventName}" from the following page content.\n「${eventName}」の${catLabel}コースについて、詳細情報を抽出してください。\n\n`

    const requiredFields = getRequiredFields(raceType)

    // --- ステップ1: ページ取得 ---
    let html = opts.html || null
    let fetchedUrl = officialUrl

    if (!_batchResult && !html && officialUrl && !isPortalUrl(officialUrl)) {
      try {
        html = await fetchHtml(officialUrl)
      } catch { /* fallback to Tavily */ }
    }

    let extracted = {}
    let totalTokens = 0

    if (_batchResult) {
      // バッチモード: Batch API の結果を使用（50% コスト削減済み）
      extracted = _batchResult
      totalTokens += (_batchResult._usage?.input_tokens || 0) + (_batchResult._usage?.output_tokens || 0)
    } else if (html) {
      const content = extractRelevantContent(html)
      if (content.length >= 50) {
        const result = await callLlm(anthropic, CATEGORY_DETAIL_PROMPT, userMessage + content)
        totalTokens += (result._usage?.input_tokens || 0) + (result._usage?.output_tokens || 0)
        extracted = result
      }
    } else {
      // Tavily フォールバック
      const query = `${eventName} ${catName} ${distKm || ''}km entry fee time limit mandatory gear 参加費 制限時間 必携品`
      const searchResults = await fetchTavilySearch(query)
      for (const content of searchResults) {
        if (content.length < 50) continue
        try {
          const result = await callLlm(anthropic, CATEGORY_DETAIL_PROMPT, userMessage + content)
          totalTokens += (result._usage?.input_tokens || 0) + (result._usage?.output_tokens || 0)
          // マージ
          for (const key of Object.keys(result)) {
            if (key === '_usage') continue
            if (result[key] != null && extracted[key] == null) extracted[key] = result[key]
          }
        } catch { /* ignore */ }
      }
    }

    // --- ステップ2: 関連ページ補完（必須フィールドが未取得の場合） ---
    const needsMore = !isRequiredFieldsFilled(extracted, requiredFields)
    if (needsMore && html && fetchedUrl && !isPortalUrl(fetchedUrl)) {
      const relatedLinks = extractRelevantLinks(html, fetchedUrl).slice(0, 3)
      for (const link of relatedLinks) {
        try {
          const linkHtml = await fetchHtml(link)
          const linkContent = extractRelevantContent(linkHtml, 5000)
          if (linkContent.length < 50) continue
          const result = await callLlm(anthropic, CATEGORY_DETAIL_PROMPT, userMessage + linkContent)
          totalTokens += (result._usage?.input_tokens || 0) + (result._usage?.output_tokens || 0)
          for (const key of Object.keys(result)) {
            if (key === '_usage') continue
            if (result[key] != null && extracted[key] == null) extracted[key] = result[key]
          }
        } catch { /* ignore */ }
      }
    }

    // --- ステップ2.5: Tavily検索で必須フィールド補完 ---
    const stillNeedsMore = !isRequiredFieldsFilled(extracted, requiredFields)
    if (stillNeedsMore && process.env.TAVILY_API_KEY) {
      try {
        const missingFields = requiredFields.filter(f => extracted[f] == null)
        const fieldKeywords = missingFields.map(f => {
          const map = { entry_fee: 'entry fee 参加費', time_limit: '制限時間 time limit', elevation_gain: '累積標高 elevation', mandatory_gear: '必携品 mandatory gear', start_time: 'start time スタート時間' }
          return map[f] || f
        }).join(' ')
        const searchQuery = `${eventName} ${catName} ${fieldKeywords}`
        const searchResults = await fetchTavilySearch(searchQuery)
        for (const content of searchResults) {
          if (content.length < 30) continue
          try {
            const result = await callLlm(anthropic, CATEGORY_DETAIL_PROMPT, userMessage + content)
            totalTokens += (result._usage?.input_tokens || 0) + (result._usage?.output_tokens || 0)
            for (const key of Object.keys(result)) {
              if (key === '_usage') continue
              if (result[key] != null && extracted[key] == null) extracted[key] = result[key]
            }
            if (isRequiredFieldsFilled(extracted, requiredFields)) break
          } catch { /* ignore */ }
        }
      } catch { /* ignore Tavily search failure entirely */ }
    }

    if (dryRun) {
      console.log(`  DRY catDetail: ${eventName?.slice(0, 25)} / ${catLabel} | fee:${extracted.entry_fee ?? '?'} limit:${extracted.time_limit ?? '?'} tokens:${totalTokens}`)
      return { success: true, categoryId }
    }

    // --- ステップ3: 成功判定 + DB 書き込み ---
    const allRequiredFilled = isRequiredFieldsFilled(extracted, requiredFields)

    const sanitizedTimeLimit = sanitizeTimeLimit(extracted.time_limit)
    const params = [
      categoryId,
      extracted.entry_fee != null ? parseInt(extracted.entry_fee, 10) : null,
      extracted.entry_fee_currency || null,
      sanitizeTime(extracted.start_time),
      sanitizeTime(extracted.reception_end),
      sanitizedTimeLimit,
      extracted.cutoff_times?.length > 0 ? JSON.stringify(extracted.cutoff_times) : null,
      extracted.elevation_gain ?? null,
      extracted.mandatory_gear || null,
      extracted.mandatory_gear_en || null,
      extracted.poles_allowed ?? null,
      extracted.itra_points ?? null,
      extracted.recommended_gear || null,
      extracted.recommended_gear_en || null,
      extracted.prohibited_items || null,
      extracted.prohibited_items_en || null,
      extracted.reception_place || null,
      extracted.reception_place_en || null,
      extracted.start_place || null,
      extracted.start_place_en || null,
      extracted.finish_rate ?? null,
    ]

    // エラー分類
    const hasAnyData = Object.keys(extracted).some(k => k !== '_usage' && extracted[k] != null)
    let errorType = null
    let errorMessage = null
    if (!allRequiredFilled) {
      const missing = requiredFields.filter(f => extracted[f] == null)
      errorMessage = `Missing required: ${missing.join(', ')}`
      errorType = hasAnyData ? 'partial' : 'empty_response'
    }

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
          mandatory_gear_en  = COALESCE(mandatory_gear_en, $10),
          poles_allowed      = COALESCE(poles_allowed, $11),
          itra_points        = COALESCE(itra_points, $12),
          recommended_gear   = COALESCE(recommended_gear, $13),
          recommended_gear_en = COALESCE(recommended_gear_en, $14),
          prohibited_items   = COALESCE(prohibited_items, $15),
          prohibited_items_en = COALESCE(prohibited_items_en, $16),
          reception_place    = COALESCE(reception_place, $17),
          reception_place_en = COALESCE(reception_place_en, $18),
          start_place        = COALESCE(start_place, $19),
          start_place_en     = COALESCE(start_place_en, $20),
          finish_rate        = COALESCE(finish_rate, $21),
          collected_at       = CASE WHEN ${allRequiredFilled} THEN NOW() ELSE collected_at END,
          attempt_count      = CASE WHEN ${allRequiredFilled} THEN attempt_count ELSE attempt_count + 1 END,
          last_error_type    = CASE WHEN ${allRequiredFilled} THEN NULL ELSE $22 END,
          last_error_message = CASE WHEN ${allRequiredFilled} THEN NULL ELSE $23 END
         WHERE id = $1`,
        [...params, errorType, errorMessage]
      )
    } catch (dbErr) {
      // DB書き込み失敗時: 問題のあるフィールドを NULL にしてリトライ
      console.warn(`  [cat-detail] DB write failed, retrying with nullified fields: ${dbErr.message?.slice(0, 80)}`)
      await client.query(
        `UPDATE ${SCHEMA}.categories SET
          entry_fee          = COALESCE(entry_fee, $2),
          entry_fee_currency = COALESCE(entry_fee_currency, $3),
          elevation_gain     = COALESCE(elevation_gain, $4),
          mandatory_gear     = COALESCE(mandatory_gear, $5),
          mandatory_gear_en  = COALESCE(mandatory_gear_en, $6),
          poles_allowed      = COALESCE(poles_allowed, $7),
          itra_points        = COALESCE(itra_points, $8),
          attempt_count      = attempt_count + 1,
          last_error_type    = 'db_error',
          last_error_message = $9
         WHERE id = $1`,
        [
          categoryId,
          params[1],  // entry_fee
          params[2],  // entry_fee_currency
          params[7],  // elevation_gain
          params[8],  // mandatory_gear
          params[9],  // mandatory_gear_en
          params[10], // poles_allowed
          params[11], // itra_points
          dbErr.message?.slice(0, 200),
        ]
      )
    }

    return { success: allRequiredFilled, categoryId }
  } catch (e) {
    // 致命的エラー: attempt_count を増やしてエラー記録
    try {
      const errClient = new pg.Client({ connectionString: process.env.DATABASE_URL })
      await errClient.connect()
      let errorType = 'temporary'
      const msg = e.message || ''
      if (msg.includes('JSON') || msg.includes('parse') || e instanceof SyntaxError) errorType = 'parse_error'
      else if (msg.includes('timeout') || msg.includes('ETIMEDOUT')) errorType = 'timeout'
      else if (msg.includes('empty') || msg.includes('no JSON found')) errorType = 'empty_response'
      else if (msg.includes('ECONNREFUSED') || msg.includes('relation') || msg.includes('duplicate key')) errorType = 'db_error'
      await errClient.query(
        `UPDATE ${SCHEMA}.categories SET
          attempt_count = attempt_count + 1,
          last_error_type = $2,
          last_error_message = $3
         WHERE id = $1`,
        [category.id, errorType, msg.slice(0, 200)]
      )
      await errClient.end()
    } catch { /* ignore */ }
    return { success: false, categoryId: category.id, error: e.message }
  } finally {
    try { await client.end() } catch { /* ignore */ }
  }
}

// --- CLI ---

async function fetchTargets(args) {
  const eventIdIdx = args.indexOf('--event-id')
  const EVENT_ID = eventIdIdx >= 0 ? args[eventIdIdx + 1] : null
  const catIdIdx = args.indexOf('--category-id')
  const CAT_ID = catIdIdx >= 0 ? args[catIdIdx + 1] : null

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  let targets = []

  if (CAT_ID) {
    const { rows } = await client.query(
      `SELECT c.id, c.name, c.distance_km, e.id as event_id, e.name as event_name, e.official_url, e.race_type
       FROM ${SCHEMA}.categories c JOIN ${SCHEMA}.events e ON c.event_id = e.id
       WHERE c.id = $1`,
      [CAT_ID]
    )
    targets = rows.map((r) => ({
      event: { id: r.event_id, name: r.event_name, official_url: r.official_url, race_type: r.race_type },
      category: { id: r.id, name: r.name, distance_km: r.distance_km },
    }))
  } else if (EVENT_ID) {
    const { rows: [ev] } = await client.query(
      `SELECT id, name, official_url, race_type FROM ${SCHEMA}.events WHERE id = $1`,
      [EVENT_ID]
    )
    if (!ev) { console.log('イベントが見つかりません'); process.exit(1) }
    const { rows: cats } = await client.query(
      `SELECT id, name, distance_km FROM ${SCHEMA}.categories
       WHERE event_id = $1 AND collected_at IS NULL AND attempt_count < 3`,
      [EVENT_ID]
    )
    targets = cats.map((c) => ({ event: ev, category: c }))
  }

  await client.end()
  return targets
}

async function runCli() {
  const args = process.argv.slice(2)
  const DRY_RUN = args.includes('--dry-run')
  const targets = await fetchTargets(args)

  console.log(`対象: ${targets.length} カテゴリ (DRY_RUN: ${DRY_RUN})\n`)
  let ok = 0, err = 0
  for (const { event, category } of targets) {
    const result = await enrichCategoryDetail(event, category, { dryRun: DRY_RUN })
    if (result.success) { ok++; console.log(`  OK  ${event.name?.slice(0, 30)} / ${category.name}`) }
    else { err++; console.log(`  ERR ${event.name?.slice(0, 30)} / ${category.name} | ${result.error?.slice(0, 50)}`) }
  }
  console.log(`\n完了: OK ${ok} / ERR ${err}`)
}

/**
 * バッチモード CLI
 * 1. 全対象の HTML を事前取得
 * 2. LLM リクエストを一括で Batch API に送信（50% コスト削減）
 * 3. 結果を受け取り DB 書き込み
 */
async function runBatchCli() {
  const args = process.argv.slice(2)
  const DRY_RUN = args.includes('--dry-run')
  const targets = await fetchTargets(args)

  if (targets.length === 0) {
    console.log('対象カテゴリなし')
    return
  }

  console.log(`[batch] 対象: ${targets.length} カテゴリ (DRY_RUN: ${DRY_RUN})\n`)

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // --- パス1: HTML 取得 + LLM リクエスト構築 ---
  const batchRequests = []
  const targetMap = new Map()  // custom_id → { event, category }
  const htmlCache = new Map()  // official_url → html
  const syncFallbackTargets = []  // バッチに含められないターゲット

  for (const { event, category } of targets) {
    const { name: eventName, official_url: officialUrl } = event
    const { id: categoryId, name: catName, distance_km: distKm } = category
    const catLabel = `${catName}${distKm ? `(${distKm}km)` : ''}`
    const userMessage = `Extract detailed information for the "${catLabel}" course of "${eventName}" from the following page content.\n「${eventName}」の${catLabel}コースについて、詳細情報を抽出してください。\n\n`

    let html = htmlCache.get(officialUrl) ?? null
    if (!html && officialUrl && !isPortalUrl(officialUrl)) {
      try {
        html = await fetchHtml(officialUrl)
        htmlCache.set(officialUrl, html)
      } catch {
        console.log(`  [fetch] WARN ${eventName?.slice(0, 30)} | HTML取得失敗`)
      }
    }

    if (html) {
      const content = extractRelevantContent(html)
      if (content.length >= 50) {
        const customId = `cat_${categoryId}`
        batchRequests.push({
          custom_id: customId,
          systemPrompt: CATEGORY_DETAIL_PROMPT,
          userContent: userMessage + content,
        })
        targetMap.set(customId, { event, category })
        continue
      }
    }

    // HTML 取得失敗 → 同期モードにフォールバック
    console.log(`  [batch] ${eventName?.slice(0, 30)} / ${catLabel} → 同期フォールバック`)
    syncFallbackTargets.push({ event, category })
  }

  console.log(`[batch] ${batchRequests.length} 件をバッチ送信、${syncFallbackTargets.length} 件は同期フォールバック\n`)

  // --- パス2: バッチ送信 + 待機 ---
  let batchResults = new Map()
  if (batchRequests.length > 0 && !DRY_RUN) {
    batchResults = await runBatch(anthropic, batchRequests)
  } else if (DRY_RUN) {
    console.log(`[batch] DRY_RUN: バッチ送信スキップ`)
  }

  // --- パス3: 結果処理 ---
  let ok = 0, err = 0

  // バッチ結果処理
  for (const [customId, meta] of targetMap) {
    const { event, category } = meta

    if (DRY_RUN) {
      console.log(`  DRY (batch) ${event.name?.slice(0, 30)} / ${category.name}`)
      ok++
      continue
    }

    const batchResult = batchResults.get(customId)
    if (!batchResult || !batchResult.success) {
      // バッチ失敗 → 同期フォールバック
      const errorMsg = batchResult?.error || 'No batch result'
      console.log(`  [batch] ${event.name?.slice(0, 30)} / ${category.name} | バッチ失敗: ${errorMsg.slice(0, 40)} → 同期フォールバック`)
      const result = await enrichCategoryDetail(event, category, { dryRun: false })
      if (result.success) { ok++; console.log(`  OK  (sync-fallback) ${event.name?.slice(0, 30)} / ${category.name}`) }
      else { err++; console.log(`  ERR (sync-fallback) ${event.name?.slice(0, 30)} / ${category.name} | ${result.error?.slice(0, 50)}`) }
      continue
    }

    // バッチ成功 → enrichCategoryDetail と同等の DB 書き込み（同期フォールバックで再利用）
    try {
      const result = await enrichCategoryDetail(event, category, {
        dryRun: false,
        _batchResult: batchResult.parsed,
      })
      if (result.success) { ok++; console.log(`  OK  (batch) ${event.name?.slice(0, 30)} / ${category.name}`) }
      else { err++; console.log(`  PARTIAL (batch) ${event.name?.slice(0, 30)} / ${category.name}`) }
    } catch (e) {
      err++
      console.log(`  ERR (batch) ${event.name?.slice(0, 30)} / ${category.name} | ${e.message?.slice(0, 50)}`)
    }
  }

  // 同期フォールバック分
  for (const { event, category } of syncFallbackTargets) {
    const result = await enrichCategoryDetail(event, category, { dryRun: DRY_RUN })
    if (result.success) { ok++; console.log(`  OK  (sync) ${event.name?.slice(0, 30)} / ${category.name}`) }
    else { err++; console.log(`  ERR (sync) ${event.name?.slice(0, 30)} / ${category.name} | ${result.error?.slice(0, 50)}`) }
  }

  console.log(`\n完了: OK ${ok} / ERR ${err}`)
}

const isDirectRun = process.argv[1]?.includes('enrich-category-detail')
if (isDirectRun) {
  const useBatch = process.argv.includes('--batch')
  const runner = useBatch ? runBatchCli : runCli
  runner().catch((e) => { console.error(e); process.exit(1) })
}
