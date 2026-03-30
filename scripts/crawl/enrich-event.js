/**
 * ②-A イベント情報・コース特定スクリプト
 * イベント基本情報 + ユニークコース一覧を抽出（詳細は enrich-category-detail.js で収集）
 *
 * 使い方:
 *   node scripts/crawl/enrich-event.js                        # 全未処理件
 *   node scripts/crawl/enrich-event.js --event-id <uuid>      # 特定イベント
 *   node scripts/crawl/enrich-event.js --dry-run              # DB更新なし
 *   node scripts/crawl/enrich-event.js --limit 5              # 最初の5件のみ
 *   node scripts/crawl/enrich-event.js --batch                # Batch API 使用（50%コスト削減）
 *   node scripts/crawl/enrich-event.js --batch --limit 50     # Batch API + 件数制限
 */
import pg from 'pg'
import Anthropic from '@anthropic-ai/sdk'
import {
  loadEnv, fetchHtml, extractRelevantContent, extractExternalOfficialLinks,
  extractRelevantLinks, callLlm, fetchTavilySearch, isPortalUrl,
  reclassifyRaceType, AGGREGATOR_DOMAINS, extractAndSaveCourseMap,
} from './lib/enrich-utils.js'
import { runBatch } from './lib/batch-utils.js'

loadEnv()
const SCHEMA = process.env.SUPABASE_SCHEMA ?? 'yabai_travel'

// --- Google API ヘルパー ---

const PRICE_LEVEL_TO_JPY = { 1: 5000, 2: 10000, 3: 15000, 4: 25000 }

async function geocodeLocation(location, apiKey) {
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${apiKey}`
  )
  const data = await res.json()
  if (data.status !== 'OK' || !data.results?.length) return null
  return data.results[0].geometry.location // { lat, lng }
}

async function searchNearbyLodging(lat, lng, apiKey) {
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=10000&type=lodging&key=${apiKey}`
  )
  const data = await res.json()
  if (data.status !== 'OK') return []
  return data.results.slice(0, 5).map((p) => ({
    name: p.name,
    place_id: p.place_id,
    lat: p.geometry.location.lat,
    lng: p.geometry.location.lng,
    price_level: p.price_level,
  }))
}

async function getPlaceNameInLanguage(placeId, language, apiKey) {
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name&language=${language}&key=${apiKey}`
  )
  const data = await res.json()
  return data.result?.name || null
}

// --- LLM プロンプト（バイリンガル統合） ---

const EVENT_SYSTEM_PROMPT = `You are an expert at extracting race event information.
Extract the basic event information and unique course list from the given page content in JSON format.
IMPORTANT: For all text fields, provide BOTH Japanese and English values. Use the "_en" suffix fields for English.
If the source is in Japanese, translate to English for _en fields. If the source is in English, translate to Japanese for the base fields.

{
  "event": {
    "name": "正式な大会名（日本語。HTMLタグ・記号・改行・余分なスペースを除去した純粋なテキストのみ）",
    "name_en": "Official event name in English (pure text only, no HTML tags, symbols, line breaks, or extra spaces)",
    "event_date": "YYYY-MM-DD (first day of the event)",
    "event_date_end": "YYYY-MM-DD (last day if multi-day event)",
    "location": "開催地（日本語）。日本国内なら「○○県○○市」等。海外なら「都市名, 国名」。必ず自治体名を含める",
    "location_en": "Venue location in English. Format: 'City, Country'",
    "country": "国名（日本語）",
    "country_en": "Country name in English",
    "race_type": "marathon|trail|triathlon|bike|duathlon|rogaining|spartan|hyrox|tough_mudder|obstacle|adventure|devils_circuit|strong_viking|other",
    "official_url": "Official website URL of the event (NOT portal or registration sites like runnet.jp, sportsentry.ne.jp, moshicom.com, l-tike.com)",
    "entry_url": "Registration URL",
    "entry_start": "YYYY-MM-DD",
    "entry_end": "YYYY-MM-DD",
    "reception_place": "受付場所（日本語）",
    "reception_place_en": "Check-in / registration location in English",
    "start_place": "スタート場所（日本語）",
    "start_place_en": "Start location in English",
    "weather_forecast": "開催時期の気候（日本語。気温・天候のみ。装備の推奨は含めない）",
    "weather_forecast_en": "Expected weather during event period in English (temperature and conditions only. Do NOT include gear/equipment recommendations)",
    "visa_info": "海外レースのビザ情報（日本語）。日本国内はnull",
    "visa_info_en": "Visa information in English. null for domestic Japan races",
    "recovery_facilities": "会場周辺のリカバリー施設（日本語）",
    "recovery_facilities_en": "Recovery facilities near the venue in English",
    "photo_spots": "周辺のフォトスポット・観光名所（日本語）",
    "photo_spots_en": "Photo spots and tourist attractions nearby in English",
    "description": "大会の紹介文（日本語、140文字以内。特徴・魅力・コースの概要を簡潔に）",
    "description_en": "Event description in English (140 chars max. Briefly cover key features, appeal, and course overview)",
    "latitude": "Venue latitude (decimal, e.g., 35.6762)",
    "longitude": "Venue longitude (decimal, e.g., 139.6503)"
  },
  "courses": [
    { "name": "Course name", "distance_km": number }
  ]
}

Course extraction rules:
- Output only unique courses (different distances/routes)
- The following are NOT course differences — merge them into one:
  - Entry categories (general / R.LEAGUE / early bird / late entry)
  - Gender categories (men / women)
  - Age categories (open / masters / junior / kids / children / etc.)
  - Wave start differences (Wave 1 / Wave 2 / ...)
  - Team size differences (solo / pairs / teams)
  - Price-only differences (same course, different pricing plans)
  - Same distance with different names (e.g., "Full Marathon" and "Marathon" are both 42.195km — use one)
- Example: "10km Men", "10km Women", "R.LEAGUE 10km" → { "name": "10km", "distance_km": 10 } as one entry
- Keep course names simple (e.g., "Full Marathon", "Half Marathon", "10km", "Short", "Long")
- Do NOT include participation requirements/age limits in course names
- Exclude these from courses:
  - Spectators / Supporters
  - Volunteers
  - Pacers
  - Staff / Crew
  - Kids fun run / non-competitive experience events

Other:
- Use null for items not found on the page
- Dates in YYYY-MM-DD format
- Return JSON only`

/**
 * 単一イベントの基本情報 + コース一覧を抽出
 * @param {object} event
 * @param {object} opts
 * @param {boolean} opts.dryRun
 * @param {object} opts._batchResult - バッチモード: 初回 LLM の結果を注入（内部用）
 * @param {string} opts._html - バッチモード: 事前取得済み HTML（内部用）
 * @param {string} opts._fetchedUrl - バッチモード: HTML 取得元 URL（内部用）
 */
export async function enrichEvent(event, opts = { dryRun: false }) {
  const { dryRun = false, _batchResult = null, _html = null, _fetchedUrl = null } = opts
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })

  try {
    await client.connect()
    const { id: eventId, name, official_url: officialUrl } = event

    // --- ステップ1: ページ取得 ---
    const needsTavilyLookup = !officialUrl || isPortalUrl(officialUrl)
    let html = _html || null
    let fetchedUrl = _fetchedUrl || officialUrl
    let fetchFailed = needsTavilyLookup

    if (!html && !needsTavilyLookup) {
      try {
        html = await fetchHtml(officialUrl)
      } catch (e) {
        const status = parseInt(e.message, 10)
        if (status === 403 || status === 404 || status === 429 || isNaN(status)) {
          fetchFailed = true
          const label = isNaN(status) ? 'fallback-network' : 'fallback'
          console.log(`  [${label}] ${name?.slice(0, 40)} | ${e.message} → Tavily検索`)
        } else {
          await client.query(
            `UPDATE ${SCHEMA}.events SET last_attempted_at = NOW(), attempt_count = attempt_count + 1, last_error_type = 'temporary' WHERE id = $1`,
            [eventId]
          )
          return { success: false, eventId, error: `fetch failed: ${e.message}` }
        }
      }
    } else if (_html) {
      // バッチモード: HTML は事前取得済み
      fetchFailed = false
    } else if (needsTavilyLookup) {
      console.log(`  [tavily] ${name?.slice(0, 40)} | official_url=${officialUrl?.slice(0, 40) || '(なし)'} → Tavily検索`)
    }

    let extracted = { event: {}, courses: [] }
    let totalTokens = 0

    if (_batchResult) {
      // バッチモード: 初回 LLM 結果を使用（Batch API で 50% コスト削減済み）
      extracted = _batchResult
      totalTokens += (_batchResult._usage?.input_tokens || 0) + (_batchResult._usage?.output_tokens || 0)
    } else if (!fetchFailed && html) {
      // 直接取得成功 → LLM 抽出
      const content = extractRelevantContent(html)
      if (content.length < 30) {
        // 閾値30文字未満 → Tavily フォールバック
        console.log(`  [fallback-tavily] ${name?.slice(0, 40)} | content too short (${content.length} chars)`)
        const query = `${name} 公式サイト エントリー 開催日 距離`
        const searchResults = await fetchTavilySearch(query, { includeUrls: true })
        if (searchResults.length === 0) {
          await client.query(
            `UPDATE ${SCHEMA}.events SET last_attempted_at = NOW(), attempt_count = attempt_count + 1, last_error_type = 'not_available' WHERE id = $1`,
            [eventId]
          )
          return { success: false, eventId, error: 'page content too short + no search results' }
        }
        // Tavily結果から LLM 抽出してマージ
        for (const result of searchResults) {
          if (result.content.length < 30) continue
          try {
            const searchUserMsg = `Information about "${name}":\n\n${result.content}`
            const searchExtracted = await callLlm(anthropic, EVENT_SYSTEM_PROMPT, searchUserMsg)
            totalTokens += (searchExtracted._usage?.input_tokens || 0) + (searchExtracted._usage?.output_tokens || 0)
            if (!extracted.event) extracted = { event: {}, courses: [] }
            const ae = searchExtracted.event || {}
            const e = extracted.event || {}
            extracted.event = {
              official_url:    e.official_url    ?? ae.official_url,
              name:            e.name            ?? ae.name,
              name_en:         e.name_en         ?? ae.name_en,
              event_date:      e.event_date      ?? ae.event_date,
              event_date_end:  e.event_date_end  ?? ae.event_date_end,
              location:        e.location        ?? ae.location,
              location_en:     e.location_en     ?? ae.location_en,
              country:         e.country         ?? ae.country,
              country_en:      e.country_en      ?? ae.country_en,
              race_type:       e.race_type       ?? ae.race_type,
              entry_url:       e.entry_url       ?? ae.entry_url,
              entry_start:     e.entry_start     ?? ae.entry_start,
              entry_end:       e.entry_end       ?? ae.entry_end,
              description:     e.description     ?? ae.description,
              description_en:  e.description_en  ?? ae.description_en,
              weather_forecast: e.weather_forecast ?? ae.weather_forecast,
              weather_forecast_en: e.weather_forecast_en ?? ae.weather_forecast_en,
              latitude:        e.latitude        ?? ae.latitude,
              longitude:       e.longitude       ?? ae.longitude,
            }
            if (searchExtracted.courses?.length) {
              extracted.courses = [...(extracted.courses || []), ...searchExtracted.courses]
            }
          } catch (e) {
            console.log(`    [fallback-error] ${name?.slice(0, 40)} | ${e.message?.slice(0, 60)}`)
          }
        }
      } else {
        // 通常処理（30文字以上）
        const userMsg = `Page content for "${name}":\n\n${content}`
        const result = await callLlm(anthropic, EVENT_SYSTEM_PROMPT, userMsg)
        totalTokens += (result._usage?.input_tokens || 0) + (result._usage?.output_tokens || 0)
        extracted = result
      }
    } else {
      // Tavily フォールバック
      const query = `${name} 公式サイト エントリー 開催日 距離`
      const searchResults = await fetchTavilySearch(query, { includeUrls: true })
      if (searchResults.length === 0) {
        await client.query(
          `UPDATE ${SCHEMA}.events SET last_attempted_at = NOW(), attempt_count = attempt_count + 1, last_error_type = 'not_available' WHERE id = $1`,
          [eventId]
        )
        return { success: false, eventId, error: 'no search results' }
      }

      // 公式URL候補を特定
      let discoveredOfficialUrl = null
      for (const result of searchResults) {
        if (result.url && !isPortalUrl(result.url) && !AGGREGATOR_DOMAINS.some((d) => result.url.includes(d))) {
          discoveredOfficialUrl = discoveredOfficialUrl || result.url
        }
      }

      // 各検索結果から LLM 抽出してマージ
      for (const result of searchResults) {
        if (result.content.length < 50) continue
        try {
          const searchUserMsg = `Information about "${name}":\n\n${result.content}`
          const searchExtracted = await callLlm(anthropic, EVENT_SYSTEM_PROMPT, searchUserMsg)
          totalTokens += (searchExtracted._usage?.input_tokens || 0) + (searchExtracted._usage?.output_tokens || 0)
          const ae = searchExtracted.event || {}
          const e = extracted.event || {}
          extracted.event = {
            official_url:    e.official_url    ?? ae.official_url,
            name:            e.name            ?? ae.name,
            name_en:         e.name_en         ?? ae.name_en,
            event_date:      e.event_date      ?? ae.event_date,
            event_date_end:  e.event_date_end  ?? ae.event_date_end,
            location:        e.location        ?? ae.location,
            location_en:     e.location_en     ?? ae.location_en,
            country:         e.country         ?? ae.country,
            country_en:      e.country_en      ?? ae.country_en,
            race_type:       e.race_type       ?? ae.race_type,
            entry_url:       e.entry_url       ?? ae.entry_url,
            entry_start:     e.entry_start     ?? ae.entry_start,
            entry_end:       e.entry_end       ?? ae.entry_end,
            reception_place:    e.reception_place    ?? ae.reception_place,
            reception_place_en: e.reception_place_en ?? ae.reception_place_en,
            start_place:        e.start_place        ?? ae.start_place,
            start_place_en:     e.start_place_en     ?? ae.start_place_en,
            weather_forecast:      e.weather_forecast      ?? ae.weather_forecast,
            weather_forecast_en:   e.weather_forecast_en   ?? ae.weather_forecast_en,
            visa_info:             e.visa_info             ?? ae.visa_info,
            visa_info_en:          e.visa_info_en          ?? ae.visa_info_en,
            recovery_facilities:      e.recovery_facilities      ?? ae.recovery_facilities,
            recovery_facilities_en:   e.recovery_facilities_en   ?? ae.recovery_facilities_en,
            photo_spots:       e.photo_spots       ?? ae.photo_spots,
            photo_spots_en:    e.photo_spots_en    ?? ae.photo_spots_en,
            description:       e.description       ?? ae.description,
            description_en:    e.description_en    ?? ae.description_en,
          }
          // コースをマージ
          if (searchExtracted.courses?.length > 0) {
            if (!extracted.courses || extracted.courses.length === 0) {
              extracted.courses = searchExtracted.courses
            }
          }
        } catch { /* ignore individual search result failures */ }
      }

      if (!extracted.event.official_url && discoveredOfficialUrl) {
        extracted.event.official_url = discoveredOfficialUrl
      }

      // Tavily で公式URL発見 → fetch してパス2も実行
      const officialUrlToFetch = extracted.event.official_url && !isPortalUrl(extracted.event.official_url)
        ? extracted.event.official_url : discoveredOfficialUrl
      if (officialUrlToFetch) {
        try {
          html = await fetchHtml(officialUrlToFetch)
          fetchedUrl = officialUrlToFetch
          fetchFailed = false
          const content = extractRelevantContent(html)
          if (content.length >= 50) {
            const directUserMsg = `Official page content for "${name}":\n\n${content}`
            const directResult = await callLlm(anthropic, EVENT_SYSTEM_PROMPT, directUserMsg)
            totalTokens += (directResult._usage?.input_tokens || 0) + (directResult._usage?.output_tokens || 0)
            // マージ（直接取得結果を優先）
            const de = directResult.event || {}
            const e = extracted.event || {}
            for (const key of Object.keys(de)) {
              if (de[key] != null && e[key] == null) e[key] = de[key]
            }
            if (directResult.courses?.length > 0 && (!extracted.courses || extracted.courses.length === 0)) {
              extracted.courses = directResult.courses
            }
          }
          console.log(`  [tavily→direct] ${name?.slice(0, 40)} | 公式URL取得成功: ${officialUrlToFetch.slice(0, 50)}`)
        } catch {
          // 公式URL取得失敗 → Tavily 結果のみで続行
        }
      }
    }

    // --- ステップ2: 関連ページ探索（パス2） ---
    if (!fetchFailed && html && fetchedUrl) {
      const relatedLinks = extractRelevantLinks(html, fetchedUrl)
      const externalLinks = extractExternalOfficialLinks(html, fetchedUrl)
      const allLinks = [...relatedLinks, ...externalLinks].slice(0, 2)

      for (const link of allLinks) {
        try {
          const linkHtml = await fetchHtml(link)
          const linkContent = extractRelevantContent(linkHtml, 5000)
          if (linkContent.length < 50) continue
          const linkUserMsg = `Related page content for "${name}":\n\n${linkContent}`
          const linkResult = await callLlm(anthropic, EVENT_SYSTEM_PROMPT, linkUserMsg)
          totalTokens += (linkResult._usage?.input_tokens || 0) + (linkResult._usage?.output_tokens || 0)
          const le = linkResult.event || {}
          const e = extracted.event || {}
          for (const key of Object.keys(le)) {
            if (le[key] != null && e[key] == null) e[key] = le[key]
          }
          if (linkResult.courses?.length > 0 && (!extracted.courses || extracted.courses.length === 0)) {
            extracted.courses = linkResult.courses
          }
        } catch { /* ignore */ }
      }
    }

    // --- race_type 再分類（パス0） ---
    let finalRaceType = extracted.event?.race_type || null

    // obstacle → ocr に統合（#448: obstacle カテゴリ削除予定）
    if (finalRaceType === 'obstacle') {
      finalRaceType = 'ocr'
      console.log(`  [reclassify] ${name?.slice(0, 40)} | obstacle → ocr`)
    }

    if (!finalRaceType || finalRaceType === 'other') {
      const reclassified = await reclassifyRaceType(anthropic, name)
      if (reclassified) {
        finalRaceType = reclassified
        console.log(`  [reclassify] ${name?.slice(0, 40)} | other → ${reclassified}`)
      }
    }

    if (dryRun) {
      console.log(`  DRY enrichEvent: ${name?.slice(0, 40)} | courses:${extracted.courses?.length ?? 0} | tokens:${totalTokens}`)
      return { success: true, eventId, location: extracted.event?.location || null, categoriesCount: extracted.courses?.length ?? 0 }
    }

    // --- エントリー期間バリデーション (#309) ---
    const ev = extracted.event || {}
    if (ev.entry_start && ev.event_date) {
      const entryStart = new Date(ev.entry_start)
      const eventDate = new Date(ev.event_date)
      const diffDays = (eventDate - entryStart) / (1000 * 60 * 60 * 24)
      if (diffDays >= 0 && diffDays <= 7) {
        // entry_start is within 7 days before event_date → suspicious
        console.log(`  [validate] ${name?.slice(0, 40)} | entry_start ${ev.entry_start} is ${diffDays.toFixed(0)}d before event → null`)
        ev.entry_start = null
      }
    }
    if (ev.entry_end && ev.event_date) {
      const entryEnd = new Date(ev.entry_end)
      const eventDate = new Date(ev.event_date)
      if (entryEnd > eventDate) {
        // entry_end is after event_date → invalid
        console.log(`  [validate] ${name?.slice(0, 40)} | entry_end ${ev.entry_end} is after event_date → null`)
        ev.entry_end = null
      }
    }

    // --- ステップ4: DB 書き込み（バイリンガル統合: ja + en を同時に書き込み） ---
    // #371: 座標・会場変更検知のため、更新前の値をスナップショット
    const { rows: [oldRow] } = await client.query(
      `SELECT latitude, longitude, reception_place, start_place FROM ${SCHEMA}.events WHERE id = $1`,
      [eventId]
    )
    const oldLat = oldRow?.latitude != null ? parseFloat(oldRow.latitude) : null
    const oldLng = oldRow?.longitude != null ? parseFloat(oldRow.longitude) : null
    const oldReception = oldRow?.reception_place || null
    const oldStart = oldRow?.start_place || null

    const e = ev
    const newOfficialUrl = e.official_url && !isPortalUrl(e.official_url) ? e.official_url : null
    const isPortalReplace = isPortalUrl(officialUrl)

    await client.query(
      `UPDATE ${SCHEMA}.events SET
        name            = COALESCE(name, $1),
        name_en         = COALESCE(name_en, $2),
        event_date      = ${isPortalReplace ? 'COALESCE($3, event_date)' : 'COALESCE(event_date, $3)'},
        location        = COALESCE(location, $4),
        location_en     = COALESCE(location_en, $5),
        country         = COALESCE(country, $6),
        country_en      = COALESCE(country_en, $7),
        race_type       = CASE WHEN race_type IS NULL OR race_type = 'other' THEN COALESCE($8, race_type) ELSE race_type END,
        entry_url       = COALESCE(entry_url, $9),
        entry_start     = COALESCE(entry_start, $10),
        entry_end       = COALESCE(entry_end, $11),
        reception_place    = COALESCE(reception_place, $12),
        reception_place_en = COALESCE(reception_place_en, $13),
        start_place        = COALESCE(start_place, $14),
        start_place_en     = COALESCE(start_place_en, $15),
        weather_forecast    = COALESCE(weather_forecast, $16),
        weather_forecast_en = COALESCE(weather_forecast_en, $17),
        visa_info            = COALESCE(visa_info, $18),
        visa_info_en         = COALESCE(visa_info_en, $19),
        recovery_facilities    = COALESCE(recovery_facilities, $20),
        recovery_facilities_en = COALESCE(recovery_facilities_en, $21),
        photo_spots    = COALESCE(photo_spots, $22),
        photo_spots_en = COALESCE(photo_spots_en, $23),
        official_url    = ${isPortalReplace ? 'COALESCE($24, official_url)' : 'COALESCE(official_url, $24)'},
        description      = COALESCE(description, $26),
        description_en   = COALESCE(description_en, $27),
        latitude             = COALESCE(latitude, $28),
        longitude            = COALESCE(longitude, $29)
       WHERE id = $25`,
      [
        e.name || null, e.name_en || null,
        e.event_date || null,
        e.location || null, e.location_en || null,
        e.country || null, e.country_en || null,
        finalRaceType || null,
        e.entry_url || null, e.entry_start || null, e.entry_end || null,
        e.reception_place || null, e.reception_place_en || null,
        e.start_place || null, e.start_place_en || null,
        e.weather_forecast || null, e.weather_forecast_en || null,
        e.visa_info || null, e.visa_info_en || null,
        e.recovery_facilities || null, e.recovery_facilities_en || null,
        e.photo_spots || null, e.photo_spots_en || null,
        newOfficialUrl, eventId,
        e.description || null, e.description_en || null,
        e.latitude != null ? parseFloat(e.latitude) : null,
        e.longitude != null ? parseFloat(e.longitude) : null,
      ]
    )

    // --- Google Geocoding API: LLM の location から正確な座標を取得 ---
    const googleApiKey = process.env.GOOGLE_DIRECTIONS_API_KEY
    let venueLat = e.latitude != null ? parseFloat(e.latitude) : null
    let venueLng = e.longitude != null ? parseFloat(e.longitude) : null

    if (googleApiKey && e.location) {
      try {
        const geo = await geocodeLocation(e.location, googleApiKey)
        if (geo) {
          venueLat = geo.lat
          venueLng = geo.lng
          // Geocoding 結果で座標を上書き（LLM より精度が高い）
          await client.query(
            `UPDATE ${SCHEMA}.events SET latitude = $2, longitude = $3 WHERE id = $1`,
            [eventId, venueLat, venueLng]
          )
          console.log(`  [geocode] ${name?.slice(0, 40)} | ${e.location} → ${venueLat.toFixed(4)}, ${venueLng.toFixed(4)}`)
        }
      } catch (geoErr) {
        console.log(`  [geocode] WARN ${name?.slice(0, 40)} | ${geoErr.message?.slice(0, 60)}`)
      }
    }

    // --- #371: 座標・会場変更検知 → logi再実行トリガー ---
    {
      const { rows: [newRow] } = await client.query(
        `SELECT latitude, longitude, reception_place, start_place FROM ${SCHEMA}.events WHERE id = $1`,
        [eventId]
      )
      const newLat = newRow?.latitude != null ? parseFloat(newRow.latitude) : null
      const newLng = newRow?.longitude != null ? parseFloat(newRow.longitude) : null
      const newReception = newRow?.reception_place || null
      const newStart = newRow?.start_place || null

      const coordChanged = oldLat != null && newLat != null && oldLng != null && newLng != null &&
        (Math.abs(newLat - oldLat) > 0.01 || Math.abs(newLng - oldLng) > 0.01)
      const venueChanged = (oldReception !== newReception && newReception != null) ||
        (oldStart !== newStart && newStart != null)

      if (coordChanged || venueChanged) {
        const reason = coordChanged ? 'coordinates changed' : 'venue changed'
        const { rowCount: arDel } = await client.query(
          `DELETE FROM ${SCHEMA}.access_routes WHERE event_id = $1`, [eventId]
        )
        const { rowCount: acDel } = await client.query(
          `DELETE FROM ${SCHEMA}.accommodations WHERE event_id = $1`, [eventId]
        )
        console.log(`  [logi-trigger] ${name?.slice(0, 40)} | ${reason} → access_routes:${arDel} accommodations:${acDel} deleted`)
      }
    }

    // --- Google Places API: 会場周辺の宿泊施設を取得 ---
    if (googleApiKey && venueLat != null && venueLng != null) {
      try {
        const lodgings = await searchNearbyLodging(venueLat, venueLng, googleApiKey)
        if (lodgings.length > 0) {
          // 既存の accommodations を確認
          const { rows: existingAccoms } = await client.query(
            `SELECT id FROM ${SCHEMA}.accommodations WHERE event_id = $1`,
            [eventId]
          )
          // 既存レコードがなければ Google Places の結果を挿入
          if (existingAccoms.length === 0) {
            for (const lodge of lodgings) {
              // 日本語名と英語名を取得
              let nameJa = lodge.name
              let nameEn = lodge.name
              try {
                const ja = await getPlaceNameInLanguage(lodge.place_id, 'ja', googleApiKey)
                if (ja) nameJa = ja
                const en = await getPlaceNameInLanguage(lodge.place_id, 'en', googleApiKey)
                if (en) nameEn = en
              } catch { /* Place Details 失敗は無視 */ }

              const avgCost = lodge.price_level != null ? (PRICE_LEVEL_TO_JPY[lodge.price_level] || null) : null

              await client.query(
                `INSERT INTO ${SCHEMA}.accommodations (event_id, recommended_area, recommended_area_en, avg_cost_3star, latitude, longitude)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [eventId, nameJa, nameEn, avgCost, lodge.lat, lodge.lng]
              )
            }
            console.log(`  [places] ${name?.slice(0, 40)} | ${lodgings.length} lodgings inserted`)
          }
        }
      } catch (placesErr) {
        console.log(`  [places] WARN ${name?.slice(0, 40)} | ${placesErr.message?.slice(0, 60)}`)
      }
    }

    // コースを categories に INSERT（name + distance_km のみ）
    for (const course of extracted.courses || []) {
      if (!course.name) continue
      const exists = await client.query(
        `SELECT id FROM ${SCHEMA}.categories WHERE event_id = $1 AND name = $2`,
        [eventId, course.name]
      )
      if (exists.rows.length === 0) {
        await client.query(
          `INSERT INTO ${SCHEMA}.categories (event_id, name, distance_km, collected_at) VALUES ($1, $2, $3, NULL)`,
          [eventId, course.name, course.distance_km ?? null]
        )
      } else {
        // distance_km が null なら更新
        await client.query(
          `UPDATE ${SCHEMA}.categories SET distance_km = COALESCE(distance_km, $2) WHERE id = $1`,
          [exists.rows[0].id, course.distance_km ?? null]
        )
      }
    }

    // カテゴリ重複削除: 同一 event_id × distance_km → 最短名を残す
    await client.query(
      `DELETE FROM ${SCHEMA}.categories WHERE id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (
            PARTITION BY event_id, distance_km
            ORDER BY LENGTH(name) ASC, collected_at ASC NULLS LAST
          ) as rn
          FROM ${SCHEMA}.categories
          WHERE event_id = $1 AND distance_km IS NOT NULL
        ) sub WHERE rn > 1
      )`,
      [eventId]
    )

    // コースマップ抽出
    if (!fetchFailed && html && fetchedUrl) {
      try {
        await extractAndSaveCourseMap(html, fetchedUrl, eventId, client, SCHEMA)
      } catch (err) {
        console.log(`  [course-map] ERR ${name?.slice(0, 40)} | ${err.message?.slice(0, 50)}`)
      }
    }

    // --- ステップ5: 品質ゲート ---
    const { rows: cats } = await client.query(
      `SELECT id, distance_km FROM ${SCHEMA}.categories WHERE event_id = $1`,
      [eventId]
    )
    const hasQuality = cats.length >= 1 && cats.some((c) => c.distance_km != null)

    const { rows: [currentEvent] } = await client.query(
      `SELECT attempt_count FROM ${SCHEMA}.events WHERE id = $1`,
      [eventId]
    )
    const attemptCount = (currentEvent?.attempt_count || 0) + 1

    if (hasQuality) {
      await client.query(
        `UPDATE ${SCHEMA}.events SET collected_at = NOW(), last_attempted_at = NOW(), attempt_count = $2, last_error_type = NULL WHERE id = $1`,
        [eventId, attemptCount]
      )
    } else if (attemptCount >= 3) {
      // 3回失敗 → 強制通過
      await client.query(
        `UPDATE ${SCHEMA}.events SET collected_at = NOW(), last_attempted_at = NOW(), attempt_count = $2, enrich_quality = 'low', last_error_type = 'not_available' WHERE id = $1`,
        [eventId, attemptCount]
      )
      console.log(`  [quality-gate] LOW ${name?.slice(0, 40)} | 3回失敗で強制通過`)
    } else {
      // 品質不足 → 次回再試行
      await client.query(
        `UPDATE ${SCHEMA}.events SET last_attempted_at = NOW(), attempt_count = $2, last_error_type = 'temporary' WHERE id = $1`,
        [eventId, attemptCount]
      )
      console.log(`  [quality-gate] FAIL ${name?.slice(0, 40)} | cats:${cats.length} | attempt:${attemptCount}`)
    }

    return { success: true, eventId, location: e.location || null, categoriesCount: cats.length }
  } catch (e) {
    // エラー分類（last_error_type の許可値: 'temporary', 'not_available', 'bug' のみ）
    let errorType = 'temporary'
    const msg = e.message || ''
    if (msg.includes('JSON') || msg.includes('parse') || e instanceof SyntaxError) {
      errorType = 'temporary'  // parse エラーは retry 対象
    } else if (msg.includes('timeout') || msg.includes('ETIMEDOUT') || msg.includes('ECONNABORTED') || e.code === 'ETIMEDOUT') {
      errorType = 'temporary'  // timeout は retry 対象
    } else if (msg.includes('empty') || msg.includes('no JSON found')) {
      errorType = 'not_available'
    } else if (msg.includes('ECONNREFUSED') || msg.includes('relation') || msg.includes('column') || msg.includes('duplicate key') || msg.includes('violates')) {
      errorType = 'temporary'  // DB constraint エラーは retry 対象
      // DB constraint 違反はログに完全なエラーを出す
      console.log(`  [db-constraint] ${event.name?.slice(0, 40)} | ${msg}`)
    }
    try {
      await client.query(
        `UPDATE ${SCHEMA}.events SET last_attempted_at = NOW(), attempt_count = attempt_count + 1, last_error_type = $2 WHERE id = $1`,
        [event.id, errorType]
      )
    } catch { /* ignore */ }
    return { success: false, eventId: event.id, error: e.message }
  } finally {
    try { await client.end() } catch { /* ignore */ }
  }
}

// --- CLI ---

async function fetchEventTargets(args) {
  const limitIdx = args.indexOf('--limit')
  const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity
  const eventIdIdx = args.indexOf('--event-id')
  const EVENT_ID = eventIdIdx >= 0 ? args[eventIdIdx + 1] : null

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  let rows
  if (EVENT_ID) {
    const res = await client.query(
      `SELECT id, name, official_url, location, country FROM ${SCHEMA}.events WHERE id = $1`,
      [EVENT_ID]
    )
    rows = res.rows
  } else {
    const res = await client.query(
      `SELECT id, name, official_url, location, country FROM ${SCHEMA}.events
       WHERE collected_at IS NULL AND (enrich_quality IS NULL OR enrich_quality != 'low')
       ORDER BY updated_at ASC LIMIT $1`,
      [LIMIT === Infinity ? 1000 : LIMIT]
    )
    rows = res.rows
  }
  await client.end()
  return rows
}

async function runCli() {
  const args = process.argv.slice(2)
  const DRY_RUN = args.includes('--dry-run')
  const rows = await fetchEventTargets(args)

  console.log(`対象: ${rows.length} 件 (DRY_RUN: ${DRY_RUN})\n`)
  let ok = 0, err = 0
  for (const event of rows) {
    const result = await enrichEvent(event, { dryRun: DRY_RUN })
    if (result.success) { ok++; console.log(`  OK  ${event.name?.slice(0, 50)} | courses:${result.categoriesCount}`) }
    else { err++; console.log(`  ERR ${event.name?.slice(0, 50)} | ${result.error?.slice(0, 60)}`) }
  }
  console.log(`\n完了: OK ${ok} / ERR ${err}`)
}

/**
 * バッチモード CLI
 * 1. 全対象イベントの HTML を事前取得
 * 2. 初回 LLM 抽出リクエストを一括で Batch API に送信（50% コスト削減）
 * 3. バッチ結果を使って各イベントの enrichEvent を実行（初回 LLM をスキップ）
 *
 * 注意: 関連ページ探索・race_type 再分類・Tavily フォールバックは同期処理のまま
 * （初回 LLM が全体コストの大部分を占めるため、ここだけでも十分な削減効果）
 */
async function runBatchCli() {
  const args = process.argv.slice(2)
  const DRY_RUN = args.includes('--dry-run')
  const rows = await fetchEventTargets(args)

  if (rows.length === 0) {
    console.log('対象イベントなし')
    return
  }

  console.log(`[batch] 対象: ${rows.length} 件 (DRY_RUN: ${DRY_RUN})\n`)

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // --- パス1: HTML 事前取得 + バッチリクエスト構築 ---
  const batchRequests = []
  const eventMeta = new Map()  // custom_id → { event, html, fetchedUrl }
  const syncFallbackEvents = []  // バッチに含められないイベント

  for (const event of rows) {
    const { id: eventId, name, official_url: officialUrl } = event
    const needsTavilyLookup = !officialUrl || isPortalUrl(officialUrl)

    if (needsTavilyLookup) {
      syncFallbackEvents.push(event)
      console.log(`  [batch] ${name?.slice(0, 40)} → 同期フォールバック（ポータルURL / URL なし）`)
      continue
    }

    let html = null
    try {
      html = await fetchHtml(officialUrl)
    } catch (e) {
      syncFallbackEvents.push(event)
      console.log(`  [batch] ${name?.slice(0, 40)} → 同期フォールバック（fetch失敗: ${e.message?.slice(0, 30)}）`)
      continue
    }

    const content = extractRelevantContent(html)
    if (content.length < 50) {
      syncFallbackEvents.push(event)
      console.log(`  [batch] ${name?.slice(0, 40)} → 同期フォールバック（コンテンツ短い）`)
      continue
    }

    const customId = `event_${eventId}`
    const userMsg = `Page content for "${name}":\n\n${content}`
    batchRequests.push({
      custom_id: customId,
      systemPrompt: EVENT_SYSTEM_PROMPT,
      userContent: userMsg,
    })
    eventMeta.set(customId, { event, html, fetchedUrl: officialUrl })
  }

  console.log(`\n[batch] ${batchRequests.length} 件をバッチ送信、${syncFallbackEvents.length} 件は同期フォールバック\n`)

  // --- パス2: バッチ送信 + 待機 ---
  let batchResults = new Map()
  if (batchRequests.length > 0 && !DRY_RUN) {
    batchResults = await runBatch(anthropic, batchRequests)
  } else if (DRY_RUN) {
    console.log(`[batch] DRY_RUN: バッチ送信スキップ`)
  }

  // --- パス3: バッチ結果を使って enrichEvent を実行 ---
  let ok = 0, err = 0

  for (const [customId, meta] of eventMeta) {
    const { event } = meta

    if (DRY_RUN) {
      console.log(`  DRY (batch) ${event.name?.slice(0, 50)}`)
      ok++
      continue
    }

    const batchResult = batchResults.get(customId)
    if (batchResult && batchResult.success) {
      // バッチ結果を使って enrichEvent を実行（_batchResult で初回 LLM をスキップ）
      const result = await enrichEvent(event, {
        dryRun: false,
        _batchResult: batchResult.parsed,
        _html: meta.html,
        _fetchedUrl: meta.fetchedUrl,
      })
      if (result.success) { ok++; console.log(`  OK  (batch) ${event.name?.slice(0, 50)} | courses:${result.categoriesCount}`) }
      else { err++; console.log(`  ERR (batch) ${event.name?.slice(0, 50)} | ${result.error?.slice(0, 60)}`) }
    } else {
      // バッチ失敗 → 同期フォールバック
      const errorMsg = batchResult?.error || 'No batch result'
      console.log(`  [batch] ${event.name?.slice(0, 40)} | バッチ失敗: ${errorMsg.slice(0, 40)} → 同期フォールバック`)
      const result = await enrichEvent(event, { dryRun: false })
      if (result.success) { ok++; console.log(`  OK  (sync-fallback) ${event.name?.slice(0, 50)} | courses:${result.categoriesCount}`) }
      else { err++; console.log(`  ERR (sync-fallback) ${event.name?.slice(0, 50)} | ${result.error?.slice(0, 60)}`) }
    }
  }

  // 同期フォールバック分
  for (const event of syncFallbackEvents) {
    const result = await enrichEvent(event, { dryRun: DRY_RUN })
    if (result.success) { ok++; console.log(`  OK  (sync) ${event.name?.slice(0, 50)} | courses:${result.categoriesCount}`) }
    else { err++; console.log(`  ERR (sync) ${event.name?.slice(0, 50)} | ${result.error?.slice(0, 60)}`) }
  }

  console.log(`\n完了: OK ${ok} / ERR ${err}`)
}

// CLI 実行判定
const isDirectRun = process.argv[1]?.includes('enrich-event')
if (isDirectRun) {
  const useBatch = process.argv.includes('--batch')
  const runner = useBatch ? runBatchCli : runCli
  runner().catch((e) => { console.error(e); process.exit(1) })
}
