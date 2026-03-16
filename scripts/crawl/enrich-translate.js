/**
 * ⑤ 翻訳モジュール
 * 確定済み日本語データを英訳して _en カラムに書き込む
 * 既存パイプライン（②-A/②-B/③）には一切手を入れない
 *
 * 使い方:
 *   node scripts/crawl/enrich-translate.js                    # 未翻訳を処理
 *   node scripts/crawl/enrich-translate.js --event-id <uuid>  # 特定イベント
 *   node scripts/crawl/enrich-translate.js --dry-run          # DB更新なし
 */
import pg from 'pg'
import Anthropic from '@anthropic-ai/sdk'
import { loadEnv } from './lib/enrich-utils.js'

loadEnv()
const SCHEMA = process.env.SUPABASE_SCHEMA ?? 'yabai_travel'

const TRANSLATE_PROMPT = `You are a professional translator specializing in endurance sports events.
Translate the following JSON values from Japanese to English. Keep the JSON structure exactly the same.

Rules:
- Translate only the values, not the keys
- Keep null values as null
- For place names: use the common English name if well-known, otherwise romanize (e.g., "埼玉県飯能市" → "Hanno, Saitama")
- For gear lists: translate each item (e.g., "ヘルメット、グローブ" → "Helmet, Gloves")
- For weather: translate naturally (e.g., "4月上旬、気温5〜15℃" → "Early April, 5-15°C")
- Event names: keep the original if it's already in English/romanized, otherwise translate
- Return JSON only, no explanation`

/**
 * 1イベント分を一括翻訳
 */
export async function translateEvent(event, opts = { dryRun: false }) {
  const { dryRun = false } = opts
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })

  try {
    await client.connect()
    const eventId = event.id

    // イベントの翻訳対象フィールドを取得
    const { rows: [ev] } = await client.query(
      `SELECT name, location, country, weather_forecast, reception_place, start_place,
              prohibited_items, total_cost_estimate, required_qualification,
              visa_info, recovery_facilities, photo_spots
       FROM ${SCHEMA}.events WHERE id = $1`,
      [eventId]
    )
    if (!ev) return { success: false, eventId, error: 'event not found' }

    // カテゴリの翻訳対象
    const { rows: cats } = await client.query(
      `SELECT id, name, reception_place, start_place, required_pace, required_climb_pace,
              mandatory_gear, recommended_gear, prohibited_items
       FROM ${SCHEMA}.categories WHERE event_id = $1`,
      [eventId]
    )

    // アクセスルートの翻訳対象
    const { rows: routes } = await client.query(
      `SELECT id, route_detail, shuttle_available, origin_name
       FROM ${SCHEMA}.access_routes WHERE event_id = $1`,
      [eventId]
    )

    // 宿泊の翻訳対象
    const { rows: accs } = await client.query(
      `SELECT id, recommended_area
       FROM ${SCHEMA}.accommodations WHERE event_id = $1`,
      [eventId]
    )

    // 翻訳対象をまとめる（null でないフィールドのみ）
    const toTranslate = { event: {}, categories: [], access_routes: [], accommodations: [] }
    let hasContent = false

    for (const [k, v] of Object.entries(ev)) {
      if (v != null) { toTranslate.event[k] = v; hasContent = true }
    }
    for (const cat of cats) {
      const obj = {}
      for (const [k, v] of Object.entries(cat)) {
        if (k !== 'id' && v != null) { obj[k] = v; hasContent = true }
      }
      if (Object.keys(obj).length > 0) toTranslate.categories.push({ _id: cat.id, ...obj })
    }
    for (const route of routes) {
      const obj = {}
      for (const [k, v] of Object.entries(route)) {
        if (k !== 'id' && v != null) { obj[k] = v; hasContent = true }
      }
      if (Object.keys(obj).length > 0) toTranslate.access_routes.push({ _id: route.id, ...obj })
    }
    for (const acc of accs) {
      if (acc.recommended_area) {
        toTranslate.accommodations.push({ _id: acc.id, recommended_area: acc.recommended_area })
        hasContent = true
      }
    }

    if (!hasContent) {
      return { success: true, eventId, translated: 0 }
    }

    // LLM 翻訳
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: TRANSLATE_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(toTranslate, null, 2) }],
    })

    const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return { success: false, eventId, error: 'translation parse error' }

    const translated = JSON.parse(jsonMatch[0])

    if (dryRun) {
      console.log(`  DRY translate: ${ev.name?.slice(0, 40)} | cats:${cats.length} routes:${routes.length}`)
      return { success: true, eventId, translated: 1 }
    }

    // DB 書き込み: events
    const te = translated.event || {}
    await client.query(
      `UPDATE ${SCHEMA}.events SET
        name_en = COALESCE(name_en, $1),
        location_en = COALESCE(location_en, $2),
        country_en = COALESCE(country_en, $3),
        weather_forecast_en = COALESCE(weather_forecast_en, $4),
        reception_place_en = COALESCE(reception_place_en, $5),
        start_place_en = COALESCE(start_place_en, $6),
        prohibited_items_en = COALESCE(prohibited_items_en, $7),
        total_cost_estimate_en = COALESCE(total_cost_estimate_en, $8),
        required_qualification_en = COALESCE(required_qualification_en, $9),
        visa_info_en = COALESCE(visa_info_en, $10),
        recovery_facilities_en = COALESCE(recovery_facilities_en, $11),
        photo_spots_en = COALESCE(photo_spots_en, $12)
       WHERE id = $13`,
      [
        te.name || null, te.location || null, te.country || null,
        te.weather_forecast || null, te.reception_place || null, te.start_place || null,
        te.prohibited_items || null, te.total_cost_estimate || null,
        te.required_qualification || null, te.visa_info || null,
        te.recovery_facilities || null, te.photo_spots || null,
        eventId,
      ]
    )

    // categories
    for (const tc of translated.categories || []) {
      if (!tc._id) continue
      await client.query(
        `UPDATE ${SCHEMA}.categories SET
          name_en = COALESCE(name_en, $2),
          reception_place_en = COALESCE(reception_place_en, $3),
          start_place_en = COALESCE(start_place_en, $4),
          required_pace_en = COALESCE(required_pace_en, $5),
          required_climb_pace_en = COALESCE(required_climb_pace_en, $6),
          mandatory_gear_en = COALESCE(mandatory_gear_en, $7),
          recommended_gear_en = COALESCE(recommended_gear_en, $8),
          prohibited_items_en = COALESCE(prohibited_items_en, $9)
         WHERE id = $1`,
        [
          tc._id, tc.name || null, tc.reception_place || null, tc.start_place || null,
          tc.required_pace || null, tc.required_climb_pace || null,
          tc.mandatory_gear || null, tc.recommended_gear || null, tc.prohibited_items || null,
        ]
      )
    }

    // access_routes
    for (const tr of translated.access_routes || []) {
      if (!tr._id) continue
      await client.query(
        `UPDATE ${SCHEMA}.access_routes SET
          route_detail_en = COALESCE(route_detail_en, $2),
          shuttle_available_en = COALESCE(shuttle_available_en, $3),
          origin_name_en = COALESCE(origin_name_en, $4)
         WHERE id = $1`,
        [tr._id, tr.route_detail || null, tr.shuttle_available || null, tr.origin_name || null]
      )
    }

    // accommodations
    for (const ta of translated.accommodations || []) {
      if (!ta._id) continue
      await client.query(
        `UPDATE ${SCHEMA}.accommodations SET recommended_area_en = COALESCE(recommended_area_en, $2) WHERE id = $1`,
        [ta._id, ta.recommended_area || null]
      )
    }

    return { success: true, eventId, translated: 1 }
  } catch (e) {
    return { success: false, eventId: event.id, error: e.message }
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
  const limitIdx = args.indexOf('--limit')
  const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 100

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  let rows
  if (EVENT_ID) {
    const res = await client.query(`SELECT id, name FROM ${SCHEMA}.events WHERE id = $1`, [EVENT_ID])
    rows = res.rows
  } else {
    const res = await client.query(
      `SELECT id, name FROM ${SCHEMA}.events
       WHERE collected_at IS NOT NULL AND name_en IS NULL
       ORDER BY updated_at ASC LIMIT $1`,
      [LIMIT]
    )
    rows = res.rows
  }
  await client.end()

  console.log(`翻訳対象: ${rows.length} 件 (DRY_RUN: ${DRY_RUN})\n`)
  let ok = 0, err = 0
  for (const event of rows) {
    const result = await translateEvent(event, { dryRun: DRY_RUN })
    if (result.success) { ok++; console.log(`  OK  ${event.name?.slice(0, 50)}`) }
    else { err++; console.log(`  ERR ${event.name?.slice(0, 50)} | ${result.error?.slice(0, 50)}`) }
  }
  console.log(`\n完了: OK ${ok} / ERR ${err}`)
}

const isDirectRun = process.argv[1]?.includes('enrich-translate')
if (isDirectRun) {
  runCli().catch((e) => { console.error(e); process.exit(1) })
}
