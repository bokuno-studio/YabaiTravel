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

const TRANSLATE_JA_TO_EN_PROMPT = `You are a professional translator specializing in endurance sports events.
Translate the following JSON values from Japanese to English. Keep the JSON structure exactly the same.

Rules:
- Translate only the values, not the keys
- Keep null values as null
- For place names: use the common English name if well-known, otherwise romanize (e.g., "埼玉県飯能市" → "Hanno, Saitama")
- For gear lists: translate each item (e.g., "ヘルメット、グローブ" → "Helmet, Gloves")
- For weather: translate naturally (e.g., "4月上旬、気温5〜15℃" → "Early April, 5-15°C")
- Event names: keep the original if it's already in English/romanized, otherwise translate
- Return JSON only, no explanation`

const TRANSLATE_EN_TO_JA_PROMPT = `あなたはエンデュランス系スポーツイベント専門の翻訳家です。
以下の JSON の値を英語から日本語に翻訳してください。JSON の構造はそのまま保持してください。

ルール:
- キーではなく値のみを翻訳する
- null 値はそのまま null にする
- 地名: よく知られた日本語表記があればそれを使う（例: "Chamonix, France" → "シャモニー、フランス"）
- ギアリスト: 各アイテムを翻訳する（例: "Helmet, Gloves" → "ヘルメット、グローブ"）
- 天候情報: 自然に翻訳する（例: "Early April, 5-15°C" → "4月上旬、気温5〜15℃"）
- イベント名: 固有名詞はカタカナ表記にする（例: "Ultra-Trail du Mont-Blanc" → "ウルトラトレイル・デュ・モンブラン"）
- JSON のみ返す。説明は不要`

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
              visa_info, recovery_facilities, photo_spots, description,
              name_en, location_en, country_en, weather_forecast_en, reception_place_en,
              start_place_en, prohibited_items_en, total_cost_estimate_en,
              required_qualification_en, visa_info_en, recovery_facilities_en,
              photo_spots_en, description_en, source_language
       FROM ${SCHEMA}.events WHERE id = $1`,
      [eventId]
    )
    if (!ev) return { success: false, eventId, error: 'event not found' }

    // 翻訳方向の判定: source_language に基づく
    const sourceLanguage = ev.source_language || 'ja'
    const translatePrompt = sourceLanguage === 'en' ? TRANSLATE_EN_TO_JA_PROMPT : TRANSLATE_JA_TO_EN_PROMPT

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
    // ja→en: 日本語カラムを読んで英訳 / en→ja: _en カラムを読んで和訳
    const toTranslate = { event: {}, categories: [], access_routes: [], accommodations: [] }
    let hasContent = false

    if (sourceLanguage === 'en') {
      // en→ja: _en カラムの値から日本語に翻訳
      const enFields = {
        name: ev.name_en, location: ev.location_en, country: ev.country_en,
        weather_forecast: ev.weather_forecast_en, reception_place: ev.reception_place_en,
        start_place: ev.start_place_en, prohibited_items: ev.prohibited_items_en,
        total_cost_estimate: ev.total_cost_estimate_en, required_qualification: ev.required_qualification_en,
        visa_info: ev.visa_info_en, recovery_facilities: ev.recovery_facilities_en,
        photo_spots: ev.photo_spots_en, description: ev.description_en,
      }
      for (const [k, v] of Object.entries(enFields)) {
        if (v != null) { toTranslate.event[k] = v; hasContent = true }
      }
    } else {
      // ja→en: 日本語カラムの値から英訳（従来動作）
      const jaFields = {
        name: ev.name, location: ev.location, country: ev.country,
        weather_forecast: ev.weather_forecast, reception_place: ev.reception_place,
        start_place: ev.start_place, prohibited_items: ev.prohibited_items,
        total_cost_estimate: ev.total_cost_estimate, required_qualification: ev.required_qualification,
        visa_info: ev.visa_info, recovery_facilities: ev.recovery_facilities,
        photo_spots: ev.photo_spots, description: ev.description,
      }
      for (const [k, v] of Object.entries(jaFields)) {
        if (v != null) { toTranslate.event[k] = v; hasContent = true }
      }
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
      system: [{ type: 'text', text: translatePrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: JSON.stringify(toTranslate, null, 2) }],
    })

    const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return { success: false, eventId, error: 'translation parse error' }

    const translated = JSON.parse(jsonMatch[0])

    if (dryRun) {
      console.log(`  DRY translate: ${ev.name?.slice(0, 40)} | lang:${sourceLanguage} cats:${cats.length} routes:${routes.length}`)
      return { success: true, eventId, translated: 1 }
    }

    // DB 書き込み: events
    const te = translated.event || {}
    if (sourceLanguage === 'en') {
      // en→ja: 翻訳結果を日本語カラムに書き込み（既に値がある場合はスキップ）
      await client.query(
        `UPDATE ${SCHEMA}.events SET
          name = CASE WHEN name = name_en THEN COALESCE($1, name) ELSE name END,
          location = CASE WHEN location = location_en THEN COALESCE($2, location) ELSE location END,
          country = CASE WHEN country = country_en THEN COALESCE($3, country) ELSE country END,
          weather_forecast = CASE WHEN weather_forecast = weather_forecast_en THEN COALESCE($4, weather_forecast) ELSE weather_forecast END,
          reception_place = CASE WHEN reception_place = reception_place_en THEN COALESCE($5, reception_place) ELSE reception_place END,
          start_place = CASE WHEN start_place = start_place_en THEN COALESCE($6, start_place) ELSE start_place END,
          prohibited_items = CASE WHEN prohibited_items = prohibited_items_en THEN COALESCE($7, prohibited_items) ELSE prohibited_items END,
          total_cost_estimate = COALESCE(total_cost_estimate, $8),
          required_qualification = CASE WHEN required_qualification = required_qualification_en THEN COALESCE($9, required_qualification) ELSE required_qualification END,
          visa_info = CASE WHEN visa_info = visa_info_en THEN COALESCE($10, visa_info) ELSE visa_info END,
          recovery_facilities = CASE WHEN recovery_facilities = recovery_facilities_en THEN COALESCE($11, recovery_facilities) ELSE recovery_facilities END,
          photo_spots = CASE WHEN photo_spots = photo_spots_en THEN COALESCE($12, photo_spots) ELSE photo_spots END,
          description = CASE WHEN description = description_en THEN COALESCE($14, description) ELSE description END
         WHERE id = $13`,
        [
          te.name || null, te.location || null, te.country || null,
          te.weather_forecast || null, te.reception_place || null, te.start_place || null,
          te.prohibited_items || null, te.total_cost_estimate || null,
          te.required_qualification || null, te.visa_info || null,
          te.recovery_facilities || null, te.photo_spots || null,
          eventId, te.description || null,
        ]
      )
    } else {
      // ja→en: 翻訳結果を _en カラムに書き込み（従来動作）
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
          photo_spots_en = COALESCE(photo_spots_en, $12),
          description_en = COALESCE(description_en, $14)
         WHERE id = $13`,
        [
          te.name || null, te.location || null, te.country || null,
          te.weather_forecast || null, te.reception_place || null, te.start_place || null,
          te.prohibited_items || null, te.total_cost_estimate || null,
          te.required_qualification || null, te.visa_info || null,
          te.recovery_facilities || null, te.photo_spots || null,
          eventId, te.description || null,
        ]
      )
    }

    // categories
    for (const tc of translated.categories || []) {
      if (!tc._id) continue
      if (sourceLanguage === 'en') {
        // en→ja: カテゴリの翻訳結果を日本語カラムに書き込み
        // (カテゴリには _en カラムからの比較が複雑なので COALESCE で未設定時のみ上書き)
        await client.query(
          `UPDATE ${SCHEMA}.categories SET
            name = COALESCE(name, $2),
            reception_place = COALESCE(reception_place, $3),
            start_place = COALESCE(start_place, $4),
            required_pace = COALESCE(required_pace, $5),
            required_climb_pace = COALESCE(required_climb_pace, $6),
            mandatory_gear = COALESCE(mandatory_gear, $7),
            recommended_gear = COALESCE(recommended_gear, $8),
            prohibited_items = COALESCE(prohibited_items, $9)
           WHERE id = $1`,
          [
            tc._id, tc.name || null, tc.reception_place || null, tc.start_place || null,
            tc.required_pace || null, tc.required_climb_pace || null,
            tc.mandatory_gear || null, tc.recommended_gear || null, tc.prohibited_items || null,
          ]
        )
      } else {
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
    }

    // access_routes
    for (const tr of translated.access_routes || []) {
      if (!tr._id) continue
      if (sourceLanguage === 'en') {
        await client.query(
          `UPDATE ${SCHEMA}.access_routes SET
            route_detail = COALESCE(route_detail, $2),
            shuttle_available = COALESCE(shuttle_available, $3),
            origin_name = COALESCE(origin_name, $4)
           WHERE id = $1`,
          [tr._id, tr.route_detail || null, tr.shuttle_available || null, tr.origin_name || null]
        )
      } else {
        await client.query(
          `UPDATE ${SCHEMA}.access_routes SET
            route_detail_en = COALESCE(route_detail_en, $2),
            shuttle_available_en = COALESCE(shuttle_available_en, $3),
            origin_name_en = COALESCE(origin_name_en, $4)
           WHERE id = $1`,
          [tr._id, tr.route_detail || null, tr.shuttle_available || null, tr.origin_name || null]
        )
      }
    }

    // accommodations
    for (const ta of translated.accommodations || []) {
      if (!ta._id) continue
      if (sourceLanguage === 'en') {
        await client.query(
          `UPDATE ${SCHEMA}.accommodations SET recommended_area = COALESCE(recommended_area, $2) WHERE id = $1`,
          [ta._id, ta.recommended_area || null]
        )
      } else {
        await client.query(
          `UPDATE ${SCHEMA}.accommodations SET recommended_area_en = COALESCE(recommended_area_en, $2) WHERE id = $1`,
          [ta._id, ta.recommended_area || null]
        )
      }
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
       WHERE collected_at IS NOT NULL AND (
         (source_language IS DISTINCT FROM 'en' AND name_en IS NULL)
         OR (source_language = 'en' AND name = name_en)
       )
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
