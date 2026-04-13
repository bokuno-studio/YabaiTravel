/**
 * ②-A イベント情報・カテゴリ抽出スクリプト
 * イベント基本情報 + カテゴリ一覧を Batch API で抽出
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
const { Pool } = pg
import Anthropic from '@anthropic-ai/sdk'
import {
  loadEnv, fetchHtml, extractRelevantContent, extractExternalOfficialLinks,
  extractRelevantLinks, callLlm, fetchTavilySearch, isPortalUrl,
  reclassifyRaceType, AGGREGATOR_DOMAINS, extractAndSaveCourseMap,
} from './lib/enrich-utils.js'
import { runBatch, createBatch } from './lib/batch-utils.js'

loadEnv()
const SCHEMA = process.env.SUPABASE_SCHEMA ?? 'yabai_travel'

// --- Google API ヘルパー ---

const PRICE_LEVEL_TO_JPY = { 1: 5000, 2: 10000, 3: 15000, 4: 25000 }

// --- 海上座標判定（日本国内イベントのみ対象） ---
function isSeaCoordinate(lat, lng) {
  // 日本bbox: 緯度24-46、経度122-155
  // 日本の陸上領土に対応する厳密な範囲（沖縄含む、離島も大部分カバー）
  const JAPAN_LAT_MIN = 24
  const JAPAN_LAT_MAX = 46
  const JAPAN_LNG_MIN = 122
  const JAPAN_LNG_MAX = 155

  // チェック1: bbox外 → 海上確定
  if (lat < JAPAN_LAT_MIN || lat > JAPAN_LAT_MAX ||
      lng < JAPAN_LNG_MIN || lng > JAPAN_LNG_MAX) {
    return true
  }

  // チェック2: 赤道・本初子午線付近（異常座標）
  if ((lat > -1 && lat < 1) && (lng > -1 && lng < 1)) {
    return true
  }

  // チェック3: 緯度≈経度（対角線上の異常パターン）
  if (Math.abs(lat - lng) < 0.1) {
    return true
  }

  return false
}

async function geocodeLocation(location, apiKey, countryEn = null) {
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${apiKey}`
  )
  const data = await res.json()
  if (data.status !== 'OK' || !data.results?.length) return null
  const result = data.results[0]
  const locationType = result.geometry.location_type
  if (locationType === 'GEOMETRIC_CENTER' || locationType === 'APPROXIMATE') return null
  const coords = result.geometry.location
  // 海上座標チェック: 日本国内イベント（country='Japan' または location に「日本」を含む）のみ適用
  const isJapanEvent = countryEn === 'Japan' || location?.includes('日本')
  if (isJapanEvent && isSeaCoordinate(coords.lat, coords.lng)) return null
  return coords // { lat, lng }
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
Extract the basic event information and race categories from the given page content in JSON format.
IMPORTANT: For all text fields, provide BOTH Japanese and English values. Use the "_en" suffix fields for English.
If the source is in Japanese, translate to English for _en fields. If the source is in English, translate to Japanese for the base fields.

{
  "event": {
    "name": "正式な大会名（日本語。HTMLタグ・記号・改行・余分なスペースを除去した純粋なテキストのみ）",
    "name_en": "Official event name in English (pure text only, no HTML tags, symbols, line breaks, or extra spaces)",
    "event_date": "YYYY-MM-DD (first day of the event)",
    "event_date_end": "YYYY-MM-DD (last day if multi-day event)",
    "location": "開催地（日本語）。会場名・施設名がある場合は必ず含める。例:「○○公園、東京都渋谷区」「○○スタジアム、大阪府大阪市」「Mount Kenya, ケニア」。会場名が不明な場合のみ「○○県○○市」形式でも可。必ず自治体名を含める",
    "location_en": "Venue location in English. Include venue/facility name if available. Format: 'Venue Name, City, Country' or 'City, Country'",
    "country": "国名（日本語）",
    "country_en": "Country name in English",
    "race_type": "marathon|trail|triathlon|bike|duathlon|rogaining|spartan|hyrox|tough_mudder|obstacle|adventure|devils_circuit|strong_viking|training|workshop|other",
    "official_url": "Official website URL of the event (NOT portal or registration sites like runnet.jp, sportsentry.ne.jp, moshicom.com, l-tike.com)",
    "entry_url": "Registration URL",
    "entry_start": "YYYY-MM-DD",
    "entry_end": "YYYY-MM-DD",
    "entry_start_typical": "YYYY-MM-DD",
    "entry_end_typical": "YYYY-MM-DD",
    "description": "大会の紹介文（日本語400〜600文字）。必ず次を含める: 1. なぜこのレースが特別・ユニークなのか（開催地・コース・背景） 2. 参加することでどんな体験ができるか（景色・難易度・雰囲気） 3. どんな人に向いているか 4. 他のレースと差別化できる具体的な特徴（1〜2点）。禁止: 日程・距離・申込情報の記載",
    "description_en": "Event description in English (250-400 words) with the same structure and the same prohibitions. Do not mention schedule, distance, or registration details.",
    "latitude": "Venue latitude (decimal, e.g., 35.6762)",
    "longitude": "Venue longitude (decimal, e.g., 139.6503)"
  },
  "categories": [
    {
      "name": "カテゴリ名（日本語）",
      "name_en": "Category name in English",
      "distance_km": 50.0,
      "elevation_gain": 2000
    }
  ]
}

race_type classification rules:
- Practice runs / trial races / training runs → "training"
- Workshops / clinics / lectures / seminars → "workshop"
- These are non-competitive or educational events, NOT actual competitive races
- Look for keywords like: 試走会、練習会、走力養成、実践講座、クリニック、セミナー、講習会、ワークショップ (Japanese) or "practice run", "trial", "clinic", "workshop", "seminar" (English)
- If you cannot determine the race_type from the event name and description, use "other"

Category extraction rules:
- Output all race categories / courses as an array
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
- Exclude these from categories:
  - Spectators / Supporters
  - Volunteers
  - Pacers
  - Staff / Crew
  - Kids fun run / non-competitive experience events
- distance_km must be numeric in km, or null if unknown
- elevation_gain must be numeric in meters, or null if unknown

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
 * @param {string} opts._compressedHtml - バッチモード: 抽出済みHTML（圧縮版）（内部用）
 * @param {array} opts._relatedLinks - バッチモード: 関連リンク配列（内部用）
 * @param {array} opts._externalLinks - バッチモード: 外部公式リンク配列（内部用）
 * @param {string} opts._fetchedUrl - バッチモード: HTML 取得元 URL（内部用）
 * @param {object} opts.anthropic - 共有 Anthropic インスタンス（内部用）
 * @param {object} opts.pool - 共有 PostgreSQL Pool（内部用）
 */
export async function enrichEvent(event, opts = { dryRun: false }) {
  const {
    dryRun = false,
    _batchResult = null,
    _compressedHtml = null,
    _relatedLinks = null,
    _externalLinks = null,
    _fetchedUrl = null,
    anthropic: _anthropic = null,
    pool: _pool = null
  } = opts
  const anthropic = _anthropic || new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const client = _pool ? _pool : new pg.Client({ connectionString: process.env.DATABASE_URL })

  try {
    if (!_pool) {
      await client.connect()
    }
    const { id: eventId, name, official_url: officialUrl } = event
    if (!_batchResult) {
      await client.query(
        `UPDATE ${SCHEMA}.events SET last_attempted_at = NOW(), attempt_count = attempt_count + 1, last_error_type = 'temporary', last_error_message = 'Batch API is required for enrich-event' WHERE id = $1`,
        [eventId]
      )
      return { success: false, eventId, error: 'Batch API is required for enrich-event' }
    }

    // --- ステップ1: ページ取得 ---
    const needsTavilyLookup = !officialUrl || isPortalUrl(officialUrl)
    let html = null
    let fetchedUrl = _fetchedUrl || officialUrl
    let fetchFailed = needsTavilyLookup

    if (!_compressedHtml && !needsTavilyLookup) {
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
    } else if (_compressedHtml) {
      // バッチモード: 圧縮済み HTML は事前取得済み
      html = _compressedHtml
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
      const content = extractRelevantContent(html) || ''
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
          const content = extractRelevantContent(html) || ''
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
    if (!_batchResult && !fetchFailed && html && fetchedUrl) {
      const relatedLinks = _relatedLinks || extractRelevantLinks(html, fetchedUrl)
      const externalLinks = _externalLinks || extractExternalOfficialLinks(html, fetchedUrl)
      const allLinks = [...relatedLinks, ...externalLinks].slice(0, 2)

      for (const link of allLinks) {
        try {
          const linkHtml = await fetchHtml(link)
          const linkContent = extractRelevantContent(linkHtml, 5000) || ''
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

    if (!_batchResult && (!finalRaceType || finalRaceType === 'other')) {
      const reclassified = await reclassifyRaceType(anthropic, name)
      if (reclassified) {
        finalRaceType = reclassified
        console.log(`  [reclassify] ${name?.slice(0, 40)} | other → ${reclassified}`)
      }
    }

    if (dryRun) {
      const categories = extracted.categories || extracted.courses || []
      console.log(`  DRY enrichEvent: ${name?.slice(0, 40)} | categories:${categories.length} | tokens:${totalTokens}`)
      return { success: true, eventId, location: extracted.event?.location || null, categoriesCount: categories.length }
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
    // 座標変更検知のため、更新前の値をスナップショット
    const { rows: [oldRow] } = await client.query(
      `SELECT latitude, longitude FROM ${SCHEMA}.events WHERE id = $1`,
      [eventId]
    )
    const oldLat = oldRow?.latitude != null ? parseFloat(oldRow.latitude) : null
    const oldLng = oldRow?.longitude != null ? parseFloat(oldRow.longitude) : null

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
        official_url    = ${isPortalReplace ? 'COALESCE($12, official_url)' : 'COALESCE(official_url, $12)'},
        description      = COALESCE(description, $14),
        description_en   = COALESCE(description_en, $15),
        latitude             = COALESCE(latitude, $16),
        longitude            = COALESCE(longitude, $17)
       WHERE id = $13`,
      [
        e.name || null, e.name_en || null,
        e.event_date || null,
        e.location || null, e.location_en || null,
        e.country || null, e.country_en || null,
        finalRaceType || null,
        e.entry_url || null, e.entry_start || null, e.entry_end || null,
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
        const geo = await geocodeLocation(e.location, googleApiKey, e.country_en)
        if (geo) {
          venueLat = geo.lat
          venueLng = geo.lng
          // Geocoding 結果で座標を上書き（LLM より精度が高い）
          await client.query(
            `UPDATE ${SCHEMA}.events SET latitude = $2, longitude = $3 WHERE id = $1`,
            [eventId, venueLat, venueLng]
          )
          console.log(`  [geocode] ${name?.slice(0, 40)} | ${e.location} → ${venueLat.toFixed(4)}, ${venueLng.toFixed(4)}`)
        } else {
          // geocodeLocationがnullを返した場合（海上座標を検出した場合）
          // 既存の座標をリセット
          if (venueLat != null && venueLng != null) {
            await client.query(
              `UPDATE ${SCHEMA}.events SET latitude = NULL, longitude = NULL WHERE id = $1`,
              [eventId]
            )
            console.log(`  [geocode-sea] ${name?.slice(0, 40)} | sea coordinate detected, reset to NULL`)
          }
        }
      } catch (geoErr) {
        console.log(`  [geocode] WARN ${name?.slice(0, 40)} | ${geoErr.message?.slice(0, 60)}`)
      }
    }

    // categories を Step2 で保存
    const categories = extracted.categories || extracted.courses || []
    for (const category of categories) {
      if (!category.name) continue
      const exists = await client.query(
        `SELECT id FROM ${SCHEMA}.categories WHERE event_id = $1 AND name = $2`,
        [eventId, category.name]
      )
      if (exists.rows.length === 0) {
        await client.query(
          `INSERT INTO ${SCHEMA}.categories (event_id, name, name_en, distance_km, elevation_gain, collected_at)
           VALUES ($1, $2, $3, $4, $5, NULL)`,
          [eventId, category.name, category.name_en ?? null, category.distance_km ?? null, category.elevation_gain ?? null]
        )
      } else {
        await client.query(
          `UPDATE ${SCHEMA}.categories
           SET name_en = COALESCE(name_en, $2),
               distance_km = COALESCE(distance_km, $3),
               elevation_gain = COALESCE(elevation_gain, $4)
           WHERE id = $1`,
          [exists.rows[0].id, category.name_en ?? null, category.distance_km ?? null, category.elevation_gain ?? null]
        )
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
    // pool が渡されている場合は接続を保持、単独 client の場合のみ閉じる
    if (!_pool) {
      try { await client.end() } catch { /* ignore */ }
    }
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
       WHERE collected_at IS NULL
       AND deleted_at IS NULL
       AND attempt_count < 3
       ORDER BY updated_at ASC LIMIT $1`,
      [LIMIT === Infinity ? 1000 : LIMIT]
    )
    rows = res.rows
  }
  await client.end()
  return rows
}

async function runCli() {
  throw new Error('enrich-event.js now requires --batch. Synchronous mode is disabled.')
}

async function markEventBatchFailure(db, eventId, message) {
  await db.query(
    `UPDATE ${SCHEMA}.events
     SET last_attempted_at = NOW(),
         attempt_count = attempt_count + 1,
         last_error_type = 'temporary',
         last_error_message = $2
     WHERE id = $1`,
    [eventId, message.slice(0, 200)]
  )
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
  const SEND_ONLY = args.includes('--send-only')
  const rows = await fetchEventTargets(args)

  if (rows.length === 0) {
    console.log('対象イベントなし')
    return
  }

  console.log(`[batch] 対象: ${rows.length} 件 (DRY_RUN: ${DRY_RUN})\n`)

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  try {
    // --- パス1: イベント候補を分類（HTML 取得は遅延） ---
    const CHUNK_SIZE = 10
    const batchableEvents = []

    let ok = 0, err = 0

    for (const event of rows) {
      const { id: eventId, name, official_url: officialUrl } = event
      const needsTavilyLookup = !officialUrl || isPortalUrl(officialUrl)

      if (needsTavilyLookup) {
        if (!DRY_RUN) await markEventBatchFailure(pool, eventId, 'Batch requires a fetchable official_url')
        err++
        console.log(`  ERR (batch-skip) ${name?.slice(0, 50)} | official_url missing or portal`)
        continue
      }
      batchableEvents.push(event)
    }

    console.log(`\n[batch] ${batchableEvents.length} 件をバッチ処理\n`)

    // --- パス2+3: チャンク単位でHTML取得→バッチ送信→結果処理 ---
    for (let chunkIdx = 0; chunkIdx < batchableEvents.length; chunkIdx += CHUNK_SIZE) {
      const chunkEvents = batchableEvents.slice(chunkIdx, chunkIdx + CHUNK_SIZE)
      const chunkNumber = Math.floor(chunkIdx / CHUNK_SIZE) + 1

      // チャンク内でHTML取得 + リクエスト構築（メモリ節約）
      const chunkRequests = []
      const chunkMeta = new Map()  // custom_id → { event, compressedHtml, relatedLinks, externalLinks, fetchedUrl }

      for (const event of chunkEvents) {
        const { id: eventId, name, official_url: officialUrl } = event

        let html = null
        try {
          html = await fetchHtml(officialUrl)
        } catch (e) {
          console.log(`  [batch] ${name?.slice(0, 40)} → fetch失敗: ${e.message?.slice(0, 30)}`)
          if (!DRY_RUN) await markEventBatchFailure(pool, eventId, `fetch failed: ${e.message}`)
          err++
          continue
        }

        const content = extractRelevantContent(html) || ''
        if (content.length < 50) {
          console.log(`  [batch] ${name?.slice(0, 40)} → コンテンツ短い`)
          if (!DRY_RUN) await markEventBatchFailure(pool, eventId, 'page content too short for batch extraction')
          err++
          html = null
          continue
        }

        const customId = `event_${eventId}`
        const userMsg = `Page content for "${name}":\n\n${content}`
        const compressedHtml = content
        const relatedLinks = DRY_RUN ? [] : extractRelevantLinks(html, officialUrl)
        const externalLinks = DRY_RUN ? [] : extractExternalOfficialLinks(html, officialUrl)
        chunkRequests.push({
          custom_id: customId,
          systemPrompt: EVENT_SYSTEM_PROMPT,
          userContent: userMsg,
        })
        chunkMeta.set(customId, { event, compressedHtml, relatedLinks, externalLinks, fetchedUrl: officialUrl })
        html = null
      }

      // チャンク内のバッチを送信・結果処理
      let chunkResults = new Map()
      if (chunkRequests.length > 0 && !DRY_RUN) {
        // SEND_ONLY=true の場合: createBatch()のみ呼んでbatch_id返す
        if (SEND_ONLY) {
          const batchId = await createBatch(anthropic, chunkRequests)
          console.log(`[batch-send] batch_id=${batchId}`)
          return batchId  // batch_idを返して終了
        }
        chunkResults = await runBatch(anthropic, chunkRequests)
        console.log(`[batch] チャンク ${chunkNumber}: ${chunkRequests.length} 件送信完了`)
      } else if (DRY_RUN && chunkRequests.length > 0) {
        console.log(`[batch] チャンク ${chunkNumber}: DRY_RUN スキップ（${chunkRequests.length} 件）`)
      }

      // 結果処理
      for (const [customId, meta] of chunkMeta) {
        const { event } = meta

        if (DRY_RUN) {
          console.log(`  DRY (batch) ${event.name?.slice(0, 50)}`)
          ok++
          continue
        }

        const batchResult = chunkResults.get(customId)
        if (batchResult && batchResult.success) {
          const result = await enrichEvent(event, {
            dryRun: false,
            _batchResult: batchResult.parsed,
            _compressedHtml: meta.compressedHtml,
            _relatedLinks: meta.relatedLinks,
            _externalLinks: meta.externalLinks,
            _fetchedUrl: meta.fetchedUrl,
            anthropic,
            pool
          })
          if (result.success) { ok++; console.log(`  OK  (batch) ${event.name?.slice(0, 50)} | categories:${result.categoriesCount}`) }
          else { err++; console.log(`  ERR (batch) ${event.name?.slice(0, 50)} | ${result.error?.slice(0, 60)}`) }
        } else {
          const errorMsg = batchResult?.error || 'No batch result'
          if (!DRY_RUN) await markEventBatchFailure(pool, event.id, `batch failed: ${errorMsg}`)
          err++
          console.log(`  ERR (batch) ${event.name?.slice(0, 50)} | ${errorMsg.slice(0, 60)}`)
        }
      }

      // チャンク処理後メモリ解放
      chunkResults.clear()
      chunkMeta.clear()
      chunkRequests.length = 0
    }

    console.log(`\n完了: OK ${ok} / ERR ${err}`)
  } finally {
    await pool.end()
  }
}

/**
 * orchestrator.js から呼び出される Batch モード処理
 * runBatchCli() の内部ロジックを再利用し、イベント配列を直接受け取る
 */
export async function runOrchestratedEventBatch(events, { dryRun = false } = {}) {
  if (events.length === 0) {
    console.log('[orchestrator-batch] 対象イベントなし')
    return { ok: 0, err: 0 }
  }

  console.log(`\n[orchestrator-batch] イベント処理開始: ${events.length} 件 (DRY_RUN: ${dryRun})\n`)

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  try {
    // --- パス1: イベント候補を分類（HTML 取得は遅延） ---
    const CHUNK_SIZE = 10
    const batchableEvents = []

    let ok = 0, err = 0

    for (const event of events) {
      const { id: eventId, name, official_url: officialUrl } = event
      const needsTavilyLookup = !officialUrl || isPortalUrl(officialUrl)

      if (needsTavilyLookup) {
        if (!dryRun) await markEventBatchFailure(pool, eventId, 'Batch requires a fetchable official_url')
        err++
        console.log(`  ERR (orchestrator-batch-skip) ${name?.slice(0, 50)} | official_url missing or portal`)
        continue
      }
      batchableEvents.push(event)
    }

    // --- パス2+3: チャンク単位でHTML取得→バッチ送信→結果処理 ---

    for (let chunkIdx = 0; chunkIdx < batchableEvents.length; chunkIdx += CHUNK_SIZE) {
      const chunkEvents = batchableEvents.slice(chunkIdx, chunkIdx + CHUNK_SIZE)
      const chunkNumber = Math.floor(chunkIdx / CHUNK_SIZE) + 1

      // チャンク内でHTML取得 + リクエスト構築
      const chunkRequests = []
      const chunkMeta = new Map()

      for (const event of chunkEvents) {
        const { id: eventId, name, official_url: officialUrl } = event

        let html = null
        try {
          html = await fetchHtml(officialUrl)
        } catch (e) {
          console.log(`  [orchestrator-batch] ${name?.slice(0, 40)} → fetch失敗: ${e.message?.slice(0, 30)}`)
          if (!dryRun) await markEventBatchFailure(pool, eventId, `fetch failed: ${e.message}`)
          err++
          continue
        }

        const content = extractRelevantContent(html) || ''
        if (content.length < 50) {
          console.log(`  [orchestrator-batch] ${name?.slice(0, 40)} → コンテンツ短い`)
          if (!dryRun) await markEventBatchFailure(pool, eventId, 'page content too short for batch extraction')
          err++
          html = null
          continue
        }

        const customId = `event_${eventId}`
        const userMsg = `Page content for "${name}":\n\n${content}`
        const compressedHtml = content
        const relatedLinks = dryRun ? [] : extractRelevantLinks(html, officialUrl)
        const externalLinks = dryRun ? [] : extractExternalOfficialLinks(html, officialUrl)
        chunkRequests.push({
          custom_id: customId,
          systemPrompt: EVENT_SYSTEM_PROMPT,
          userContent: userMsg,
        })
        chunkMeta.set(customId, { event, compressedHtml, relatedLinks, externalLinks, fetchedUrl: officialUrl })
        html = null
      }

      // チャンク内のバッチを送信・結果処理
      let chunkResults = new Map()
      if (chunkRequests.length > 0 && !dryRun) {
        chunkResults = await runBatch(anthropic, chunkRequests, { dbPool: pool, scriptType: 'enrich-event' })
        console.log(`[orchestrator-batch] チャンク ${chunkNumber}: ${chunkRequests.length} 件送信完了`)
      } else if (dryRun && chunkRequests.length > 0) {
        console.log(`[orchestrator-batch] チャンク ${chunkNumber}: DRY_RUN スキップ（${chunkRequests.length} 件）`)
      }

      // 結果処理
      for (const [customId, meta] of chunkMeta) {
        const { event } = meta

        if (dryRun) {
          console.log(`  DRY (orchestrator-batch) ${event.name?.slice(0, 50)}`)
          ok++
          continue
        }

        const batchResult = chunkResults.get(customId)
        if (batchResult && batchResult.success) {
          const result = await enrichEvent(event, {
            dryRun: false,
            _batchResult: batchResult.parsed,
            _compressedHtml: meta.compressedHtml,
            _relatedLinks: meta.relatedLinks,
            _externalLinks: meta.externalLinks,
            _fetchedUrl: meta.fetchedUrl,
            anthropic,
            pool
          })
          if (result.success) { ok++; console.log(`  OK  (orchestrator-batch) ${event.name?.slice(0, 50)} | categories:${result.categoriesCount}`) }
          else { err++; console.log(`  ERR (orchestrator-batch) ${event.name?.slice(0, 50)} | ${result.error?.slice(0, 60)}`) }
        } else {
          const errorMsg = batchResult?.error || 'No batch result'
          if (!dryRun) await markEventBatchFailure(pool, event.id, `batch failed: ${errorMsg}`)
          err++
          console.log(`  ERR (orchestrator-batch) ${event.name?.slice(0, 50)} | ${errorMsg.slice(0, 60)}`)
        }
      }

      // チャンク処理後メモリ解放
      chunkResults.clear()
      chunkMeta.clear()
      chunkRequests.length = 0
    }

    console.log(`\n[orchestrator-batch] 完了: OK ${ok} / ERR ${err}`)
    return { ok, err }
  } finally {
    await pool.end()
  }
}

// CLI 実行判定
const isDirectRun = process.argv[1]?.includes('enrich-event')
if (isDirectRun) {
  const useBatch = process.argv.includes('--batch')
  if (!useBatch) {
    console.error('enrich-event.js now requires --batch. Synchronous mode is disabled.')
    process.exit(1)
  }
  runBatchCli().catch((e) => { console.error(e); process.exit(1) })
}
