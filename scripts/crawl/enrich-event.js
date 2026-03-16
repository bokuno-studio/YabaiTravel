/**
 * ②-A イベント情報・コース特定スクリプト
 * イベント基本情報 + ユニークコース一覧を抽出（詳細は enrich-category-detail.js で収集）
 *
 * 使い方:
 *   node scripts/crawl/enrich-event.js                        # 全未処理件
 *   node scripts/crawl/enrich-event.js --event-id <uuid>      # 特定イベント
 *   node scripts/crawl/enrich-event.js --dry-run              # DB更新なし
 *   node scripts/crawl/enrich-event.js --limit 5              # 最初の5件のみ
 */
import pg from 'pg'
import Anthropic from '@anthropic-ai/sdk'
import {
  loadEnv, fetchHtml, extractRelevantContent, extractExternalOfficialLinks,
  extractRelevantLinks, callLlm, fetchTavilySearch, isPortalUrl,
  reclassifyRaceType, AGGREGATOR_DOMAINS, extractAndSaveCourseMap,
} from './lib/enrich-utils.js'

loadEnv()
const SCHEMA = process.env.SUPABASE_SCHEMA ?? 'yabai_travel'

// --- LLM プロンプト（イベント専用） ---

const EVENT_SYSTEM_PROMPT = `あなたはレースイベントの情報抽出エキスパートです。
与えられたページの内容から、イベント基本情報とユニークなコース一覧を JSON 形式で抽出してください。

{
  "event": {
    "name": "正式な大会名",
    "event_date": "YYYY-MM-DD（開催初日）",
    "event_date_end": "YYYY-MM-DD（複数日の場合の最終日）",
    "location": "開催地。日本国内なら「○○県○○市」等。海外なら「都市名, 国名」。必ず自治体名を含める",
    "country": "国名（日本語）",
    "race_type": "marathon|trail|triathlon|cycling|duathlon|rogaining|spartan|hyrox|obstacle|adventure|devils_circuit|strong_viking|other",
    "official_url": "大会の公式サイトURL（ポータルや申込サイトではなく主催者の公式ページURL。runnet.jp, sportsentry.ne.jp, moshicom.com, l-tike.com 等はポータルなので除外）",
    "entry_url": "申込URL",
    "entry_start": "YYYY-MM-DD",
    "entry_end": "YYYY-MM-DD",
    "reception_place": "受付場所",
    "start_place": "スタート場所",
    "weather_forecast": "開催時期の気候（気温・天候・推奨装備）",
    "visa_info": "海外レースのビザ情報。日本国内はnull",
    "recovery_facilities": "会場周辺のリカバリー施設",
    "photo_spots": "周辺のフォトスポット・観光名所",
    "description": "大会の紹介文（140文字以内。特徴・魅力・コースの概要を簡潔に。公式サイトの情報がなければWebで検索して補完してよい）"
  },
  "courses": [
    { "name": "コース名", "distance_km": 数値 }
  ]
}

コース抽出のルール:
- courses はユニークなコース（距離・ルートが異なるもの）のみ出力する
- 以下は「コースの違い」ではないため、1つにまとめること:
  - 申込区分（一般 / R.LEAGUE / 早期申込 / レイトエントリー）
  - 性別区分（男子 / 女子）
  - 年齢区分（一般 / マスターズ / ジュニア / 親子 / 小学生）
  - Wave start の違い（Wave 1 / Wave 2 / ...）
- 例: 「10km A組(男子)」「10km B組(女子)」「R.LEAGUE 10km」→ { "name": "10km", "distance_km": 10 } として1つ
- コース名はシンプルに（例: 「フルマラソン」「ハーフマラソン」「10km」「ショート」「ロング」）

その他:
- ページに記載がない項目は null
- 日付は YYYY-MM-DD 形式
- JSON のみ返す`

/**
 * 単一イベントの基本情報 + コース一覧を抽出
 */
export async function enrichEvent(event, opts = { dryRun: false }) {
  const { dryRun = false } = opts
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })

  try {
    await client.connect()
    const { id: eventId, name, official_url: officialUrl } = event

    // --- ステップ1: ページ取得 ---
    const needsTavilyLookup = !officialUrl || isPortalUrl(officialUrl)
    let html = null
    let fetchedUrl = officialUrl
    let fetchFailed = needsTavilyLookup

    if (!needsTavilyLookup) {
      try {
        html = await fetchHtml(officialUrl)
      } catch (e) {
        const status = parseInt(e.message, 10)
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

    let extracted = { event: {}, courses: [] }
    let totalTokens = 0

    if (!fetchFailed && html) {
      // 直接取得成功 → LLM 抽出
      const content = extractRelevantContent(html)
      if (content.length < 50) {
        return { success: false, eventId, error: 'page content too short' }
      }
      const result = await callLlm(anthropic, EVENT_SYSTEM_PROMPT, `「${name}」の公式ページ内容:\n\n${content}`)
      totalTokens += (result._usage?.input_tokens || 0) + (result._usage?.output_tokens || 0)
      extracted = result
    } else {
      // Tavily フォールバック
      const query = `${name} 公式サイト エントリー 開催日 距離`
      const searchResults = await fetchTavilySearch(query, { includeUrls: true })
      if (searchResults.length === 0) {
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
          const searchExtracted = await callLlm(anthropic, EVENT_SYSTEM_PROMPT, `「${name}」に関する情報:\n\n${result.content}`)
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
            weather_forecast:     e.weather_forecast     ?? ae.weather_forecast,
            visa_info:            e.visa_info            ?? ae.visa_info,
            recovery_facilities:  e.recovery_facilities  ?? ae.recovery_facilities,
            photo_spots:          e.photo_spots          ?? ae.photo_spots,
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
            const directResult = await callLlm(anthropic, EVENT_SYSTEM_PROMPT, `「${name}」の公式ページ内容:\n\n${content}`)
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
      const allLinks = [...relatedLinks, ...externalLinks].slice(0, 5)

      for (const link of allLinks) {
        try {
          const linkHtml = await fetchHtml(link)
          const linkContent = extractRelevantContent(linkHtml, 5000)
          if (linkContent.length < 50) continue
          const linkResult = await callLlm(anthropic, EVENT_SYSTEM_PROMPT, `「${name}」の関連ページ内容:\n\n${linkContent}`)
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

    // --- ステップ4: DB 書き込み ---
    const e = extracted.event || {}
    const newOfficialUrl = e.official_url && !isPortalUrl(e.official_url) ? e.official_url : null
    const isPortalReplace = isPortalUrl(officialUrl)

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
        official_url    = ${isPortalReplace ? 'COALESCE($15, official_url)' : 'COALESCE(official_url, $15)'},
        description          = COALESCE(description, $17)
       WHERE id = $16`,
      [
        e.name || null, e.event_date || null, e.location || null, e.country || null,
        finalRaceType || null, e.entry_url || null, e.entry_start || null, e.entry_end || null,
        e.reception_place || null, e.start_place || null, e.weather_forecast || null,
        e.visa_info || null, e.recovery_facilities || null, e.photo_spots || null,
        newOfficialUrl, eventId, e.description || null,
      ]
    )

    // コースを categories に INSERT（name + distance_km のみ）
    for (const course of extracted.courses || []) {
      if (!course.name) continue
      const exists = await client.query(
        `SELECT id FROM ${SCHEMA}.categories WHERE event_id = $1 AND name = $2`,
        [eventId, course.name]
      )
      if (exists.rows.length === 0) {
        await client.query(
          `INSERT INTO ${SCHEMA}.categories (event_id, name, distance_km) VALUES ($1, $2, $3)`,
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
      `SELECT enrich_attempt_count FROM ${SCHEMA}.events WHERE id = $1`,
      [eventId]
    )
    const attemptCount = (currentEvent?.enrich_attempt_count || 0) + 1

    if (hasQuality) {
      await client.query(
        `UPDATE ${SCHEMA}.events SET collected_at = NOW(), last_attempted_at = NOW(), enrich_attempt_count = $2 WHERE id = $1`,
        [eventId, attemptCount]
      )
    } else if (attemptCount >= 3) {
      // 3回失敗 → 強制通過
      await client.query(
        `UPDATE ${SCHEMA}.events SET collected_at = NOW(), last_attempted_at = NOW(), enrich_attempt_count = $2, enrich_quality = 'low' WHERE id = $1`,
        [eventId, attemptCount]
      )
      console.log(`  [quality-gate] LOW ${name?.slice(0, 40)} | 3回失敗で強制通過`)
    } else {
      // 品質不足 → 次回再試行
      await client.query(
        `UPDATE ${SCHEMA}.events SET last_attempted_at = NOW(), enrich_attempt_count = $2 WHERE id = $1`,
        [eventId, attemptCount]
      )
      console.log(`  [quality-gate] FAIL ${name?.slice(0, 40)} | cats:${cats.length} | attempt:${attemptCount}`)
    }

    return { success: true, eventId, location: e.location || null, categoriesCount: cats.length }
  } catch (e) {
    try {
      await client.query(
        `UPDATE ${SCHEMA}.events SET last_attempted_at = NOW(), enrich_attempt_count = enrich_attempt_count + 1 WHERE id = $1`,
        [event.id]
      )
    } catch { /* ignore */ }
    return { success: false, eventId: event.id, error: e.message }
  } finally {
    try { await client.end() } catch { /* ignore */ }
  }
}

// --- CLI ---

async function runCli() {
  const args = process.argv.slice(2)
  const DRY_RUN = args.includes('--dry-run')
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

  console.log(`対象: ${rows.length} 件 (DRY_RUN: ${DRY_RUN})\n`)
  let ok = 0, err = 0
  for (const event of rows) {
    const result = await enrichEvent(event, { dryRun: DRY_RUN })
    if (result.success) { ok++; console.log(`  OK  ${event.name?.slice(0, 50)} | courses:${result.categoriesCount}`) }
    else { err++; console.log(`  ERR ${event.name?.slice(0, 50)} | ${result.error?.slice(0, 60)}`) }
  }
  console.log(`\n完了: OK ${ok} / ERR ${err}`)
}

// CLI 実行判定
const isDirectRun = process.argv[1]?.includes('enrich-event')
if (isDirectRun) {
  runCli().catch((e) => { console.error(e); process.exit(1) })
}
