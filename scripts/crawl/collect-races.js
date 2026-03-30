/**
 * ① レース名収集スクリプト（プラグインアーキテクチャ版）
 * scripts/crawl/sources/ 配下の全ソースプラグインからレース URL を収集し、events テーブルに投入
 * collected_at = NULL でマーク（未エンリッチ）
 *
 * 使い方:
 *   npm run crawl:collect               # 全件
 *   npm run crawl:collect -- --dry-run  # DB更新なし
 *   npm run crawl:collect -- --limit 5  # 最初の5件のみ
 */
import pg from 'pg'
import Anthropic from '@anthropic-ai/sdk'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as cheerio from 'cheerio'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  })
}

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const limitIdx = args.indexOf('--limit')
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity

const SCHEMA = process.env.SUPABASE_SCHEMA ?? 'yabai_travel'
const IS_STAGING = SCHEMA !== 'yabai_travel'

/** ステージングでは件数を絞り、本番では全件取得 */
function limitForEnv(arr, stagingLimit) {
  return IS_STAGING ? arr.slice(0, stagingLimit) : arr
}

// --- 共通ユーティリティ ---

async function fetchHtml(url, timeoutMs = 15000) {
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
    throw e
  }
}

// --- 名前クリーニング ---

/** 先頭の日付パターンを除去（例: "2026/5/16(土) 野辺山マラソン" → "野辺山マラソン"） */
function cleanEventName(name) {
  return (name || '')
    .replace(/^\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}[\(（][月火水木金土日][\)）]?\s*/, '')
    .replace(/^\d{4}年\d{1,2}月\d{1,2}日[\(（][月火水木金土日][\)）]?\s*/, '')
    .trim()
}

// --- ジャンク除去 ---

const JUNK_NAMES = /^(shopping_cart|Sign in|Orders|Online Shop|主催者の皆さまへ|大会主催者の方へ|エントリーガイド|OCR World Champs|SPARTAN TRAIL)$/i
const JUNK_PATTERNS = [
  /^エントリー\s*\d{4}\.\d{2}\.\d{2}/m,
  /^【スポーツの話題はこちら】/,
  /TICKET PRICES RISE.*REGISTER NOW/i,
  /^プレスリリース$/i,
]
/** エンデュランス系ではないイベントを除外するキーワード (#67) */
const NON_ENDURANCE_KEYWORDS = /スカッシュ|バドミントン|テニス|ゴルフ|卓球|ボウリング|ダーツ|ビリヤード|ゲートボール|クリケット|カーリング|アーチェリー|射撃|フェンシング|レスリング|柔道|空手|剣道|弓道|相撲|ボクシング|ラグビー|サッカー|フットサル|バレーボール|バスケ|ハンドボール|野球|ソフトボール|ホッケー|クリテリウム|ヒルクライム|サイクリング|自転車[旅競]|ロードレース(?!.*ラン)|エンデューロ(?!.*ラン)|練習会|走行会|トーナメント|選手権(?!.*マラソン|.*トレイル|.*トライアスロン|.*ラン)|プロアマ|グラベル/i
function isJunk(name) {
  const t = name?.trim() ?? ''
  return JUNK_NAMES.test(t) || JUNK_PATTERNS.some((p) => p.test(t)) || NON_ENDURANCE_KEYWORDS.test(t)
}

/** 非イベント URL を除外 */
const JUNK_URL_PATTERNS = [
  /\/(results?|classement|palmares|rankings?)(\/|$|\?)/i,
  /\/(category|tag|categorie|tags|categories)(\/|$|\?)/i,
  /\/(terms|privacy|legal|cgu|cgv|mentions-legales|contact|about|faq|help|blog(?!\/[a-z])|news|press|sponsors?)(\/|$|\?)/i,
  /\/(login|signup|register|cart|checkout|account)(\/|$|\?)/i,
  /\/(archives?|page\/\d+)(\/|$|\?)/i,
]

/** ドメイン別ノイズパターン */
const DOMAIN_JUNK_PATTERNS = [
  { domain: 'vts-photo.vietnamtrailseries.com', paths: [''] }, // 全パスを除外
  { domain: 'marathon.tokyo', paths: ['/about/', '/program/', '/course/'] },
  { domain: 'info.runsignup.com', paths: ['/about-us/', '/products/'] },
  { domain: 'event-organizer.jp', paths: ['/faq/'] },
  { domain: 'facebook.com', paths: [''] }, // SNS団体ページ
  { domain: 'events.zoom.us', paths: [''] }, // Zoomウェビナーページ
  { domain: 'connect.justrunlah.com', paths: [''] }, // JustRunLahチケットHP
]

function isJunkUrl(url) {
  if (!url) return false
  if (JUNK_URL_PATTERNS.some((p) => p.test(url))) return true
  // ドメイン別ノイズパターンチェック
  if (DOMAIN_JUNK_PATTERNS.some(({ domain, paths }) =>
    url.includes(domain) && (paths[0] === '' || paths.some(path => url.includes(path)))
  )) return true
  return false
}

/** ホームページURL（パスなし or /のみ）はnullに変換 */
function sanitizeUrl(url) {
  if (!url) return null
  try {
    const u = new URL(url)
    if (u.pathname === '/' || u.pathname === '') return null
    return url
  } catch {
    return null
  }
}

/** 全角英数→半角変換 */
function fullwidthToHalfwidth(str) {
  return str.replace(/[\uFF01-\uFF5E]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
  )
}

/** 名前を正規化（重複比較用） */
function normalizeName(name) {
  return fullwidthToHalfwidth(name ?? '')
    .replace(/第\d+回\s*/g, '')     // 「第XX回」除去
    .replace(/[\s\u3000]+/g, '')   // 全角・半角スペース除去
    .replace(/[・·.\-–—]/g, '')    // 区切り文字除去
    .toLowerCase()
}

// --- プラグインローダー ---

async function loadSources() {
  const sourcesDir = resolve(__dirname, 'sources')
  const files = readdirSync(sourcesDir).filter((f) => f.endsWith('.js'))
  const sources = []
  for (const file of files) {
    try {
      const mod = await import(`./sources/${file}`)
      sources.push(mod)
    } catch (e) {
      console.warn(`  Failed to load source plugin ${file}:`, e.message)
    }
  }
  return sources
}

/**
 * Collect races from a single source plugin
 * Sources can define:
 *   - SOURCE_URLS: fixed URLs to fetch (standalone sources)
 *   - matchesUrl(url): returns true if this source handles the given URL (URL-matched sources)
 *   - getFetchUrl(url): optionally transform the URL before fetching
 *   - parse(html, url, cheerioLoad, ctx): sync parser
 *   - parseAsync(html, url, cheerioLoad, ctx): async parser (e.g. Hardrock CSV)
 */
async function collectFromSource(source, url, ctx) {
  try {
    const fetchUrl = source.getFetchUrl ? source.getFetchUrl(url) : url
    const html = await fetchHtml(fetchUrl)
    if (source.parseAsync) {
      return await source.parseAsync(html, url, cheerio.load, ctx)
    }
    return source.parse(html, url, cheerio.load, ctx)
  } catch (e) {
    console.warn(`  [${source.SOURCE_NAME}] Error fetching ${url}: ${e.message}`)
    return []
  }
}

// --- LLM 名前翻訳 ---

/** 英語っぽい名前かどうかを簡易判定（ASCII のみなら英語扱い） */
function isEnglishName(name) {
  return /^[\x20-\x7E]+$/.test(name)
}

/**
 * レース名をバッチで英語翻訳する（Haiku で一括処理）
 * @param {string[]} names - 翻訳対象のレース名リスト
 * @returns {Promise<Record<string, string>>} - { 元の名前: 英語名 } のマップ
 */
async function batchTranslateNames(names) {
  if (!names.length) return {}

  // 既に英語の名前はそのまま返す
  const result = {}
  const toTranslate = []
  for (const name of names) {
    if (isEnglishName(name)) {
      result[name] = name
    } else {
      toTranslate.push(name)
    }
  }

  if (!toTranslate.length) return result

  const anthropic = new Anthropic()

  // 20件ずつバッチ処理
  const BATCH_SIZE = 20
  for (let i = 0; i < toTranslate.length; i += BATCH_SIZE) {
    const batch = toTranslate.slice(i, i + BATCH_SIZE)
    const nameList = JSON.stringify(batch)

    try {
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system: [{ type: 'text', text: `You are a translator specializing in endurance sports event names (trail running, marathon, spartan race, hyrox, triathlon, etc.).
Translate the given Japanese race names to English. Keep proper nouns and place names in their romanized form.
Return ONLY a valid JSON object mapping each original name to its English translation. No markdown, no explanation.`, cache_control: { type: 'ephemeral' } }],
        messages: [
          { role: 'user', content: `Translate these race names to English:\n${nameList}` },
        ],
      })

      const text = msg.content[0].text.trim()
      const parsed = JSON.parse(text)
      for (const name of batch) {
        result[name] = parsed[name] || name
      }
      console.log(`  Translated batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} names`)
    } catch (e) {
      console.warn(`  Translation batch failed: ${e.message}`)
      // フォールバック: 翻訳失敗時は元の名前をそのまま使う
      for (const name of batch) {
        result[name] = name
      }
    }
  }

  return result
}

// --- DB挿入 ---

async function insertRace(client, race) {
  // official_url OR (正規化name + event_date) で重複チェック
  // - official_url 一致 → 重複
  // - 正規化name 一致 AND (どちらかの event_date が NULL OR 同じ日付) → 重複（別年度は通す）
  // - 正規化: 全角/半角スペース・中黒・ドット等を除去して比較
  // 正規化SQL: 全角→半角 + 第XX回除去 + スペース・区切り除去 + lower
  const normalizeSQL = (col) => `lower(regexp_replace(regexp_replace(translate(${col}, '　・·.－–—ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ０１２３４５６７８９', ' ...----ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'), '第[0-9]+回\\s*', '', 'g'), '\\s+', '', 'g'))`
  const dupCheck = `WHERE NOT EXISTS (
    SELECT 1 FROM ${SCHEMA}.events
    WHERE official_url = $6
       OR (
         ${normalizeSQL('name')} = ${normalizeSQL('$1')}
         AND ($2 IS NULL OR event_date IS NULL OR event_date::text = $2::text)
       )
       OR (
         name_en IS NOT NULL AND $8::text IS NOT NULL
         AND ${normalizeSQL('name_en')} = ${normalizeSQL('$8::text')}
         AND ($2 IS NULL OR event_date IS NULL OR event_date::text = $2::text)
       )
  )`
  const result = await client.query(
    `INSERT INTO ${SCHEMA}.events (name, name_en, event_date, location, country, race_type, official_url, entry_url, collected_at)
     SELECT $1, $8::text, $2::date, $3, $4, $5, $6, $7, NULL
     ${dupCheck}
     RETURNING id`,
    [
      race.name,
      race.event_date || null,
      race.location || null,
      race.country || null,
      race.race_type || 'other',
      sanitizeUrl(race.official_url),
      sanitizeUrl(race.entry_url) || sanitizeUrl(race.official_url) || null,
      race.name_en || null,
    ]
  )
  return result.rows[0]?.id || null
}

/** CHECK_TARGET_URLS.md から URL を抽出 */
function parseCheckUrls() {
  const path = resolve(process.cwd(), 'docs/data-sources/CHECK_TARGET_URLS.md')
  const content = readFileSync(path, 'utf8')
  const urls = []
  for (const line of content.split('\n')) {
    const m = line.match(/\|\s*(https:\/\/[^\s|]+)\s*\|/)
    if (m) urls.push(m[1].trim())
  }
  return [...new Set(urls)]
}

// --- メイン ---

async function run() {
  const client = DRY_RUN ? null : new pg.Client({ connectionString: process.env.DATABASE_URL })
  if (client) await client.connect()

  console.log(`=== レース名収集開始 (DRY_RUN: ${DRY_RUN}) ===\n`)

  const sources = await loadSources()
  console.log(`Loaded ${sources.length} source plugins\n`)

  const ctx = { limitForEnv, cleanEventName }

  const allUrls = parseCheckUrls()
  let allRaces = []

  // 1. Process URL-matched sources (sources that match URLs from CHECK_TARGET_URLS.md)
  const urlMatchedSources = sources.filter((s) => s.matchesUrl)
  const standaloneSources = sources.filter((s) => s.SOURCE_URLS && !s.matchesUrl)

  for (const url of allUrls) {
    const matchingSource = urlMatchedSources.find((s) => s.matchesUrl(url))
    if (matchingSource) {
      const races = await collectFromSource(matchingSource, url, ctx)
      if (races.length) {
        allRaces.push(...races)
        console.log(`  [${matchingSource.SOURCE_NAME}] ${url.slice(0, 50)} → ${races.length} races`)
      }
    }
  }

  // 2. Process standalone sources (sources with fixed SOURCE_URLS)
  for (const source of standaloneSources) {
    for (const url of source.SOURCE_URLS) {
      const races = await collectFromSource(source, url, ctx)
      if (races.length) {
        allRaces.push(...races)
        console.log(`  [${source.SOURCE_NAME}] ${races.length} races`)
      }
    }
  }

  // ジャンク除去・重複除去（正規化名で比較）
  allRaces = allRaces.filter((r) => !isJunk(r.name) && !isJunkUrl(r.official_url))
  const seenUrls = new Set()
  const seenNames = new Set()
  allRaces = allRaces.filter((r) => {
    if (r.official_url && seenUrls.has(r.official_url)) return false
    const normalized = normalizeName(r.name)
    if (normalized && seenNames.has(normalized)) return false
    const normalizedEn = r.name_en ? normalizeName(r.name_en) : null
    if (normalizedEn && seenNames.has(normalizedEn)) return false
    if (r.official_url) seenUrls.add(r.official_url)
    if (normalized) seenNames.add(normalized)
    if (normalizedEn) seenNames.add(normalizedEn)
    return true
  })

  console.log(`\n収集完了: ${allRaces.length} races\n`)

  // LLM でレース名を英語翻訳
  if (!DRY_RUN) {
    console.log(`--- レース名の英語翻訳 ---`)
    const names = allRaces.map((r) => r.name).filter(Boolean)
    const translations = await batchTranslateNames(names)
    for (const race of allRaces) {
      if (race.name && translations[race.name]) {
        race.name_en = translations[race.name]
      }
    }
    console.log(`翻訳完了: ${Object.keys(translations).length} names\n`)
  }

  const targets = allRaces.slice(0, LIMIT)
  let inserted = 0
  let skipped = 0
  let errors = 0

  for (let i = 0; i < targets.length; i++) {
    const race = targets[i]
    const label = `[${i + 1}/${targets.length}]`

    if (!race.official_url && !race.name) {
      console.log(`${label} SKIP (no URL/name) ${race.name?.slice(0, 40)}`)
      skipped++
      continue
    }

    if (DRY_RUN) {
      console.log(`${label} DRY ${race.name?.slice(0, 40)} | ${race.source} | ${race.official_url?.slice(0, 50)}`)
      continue
    }

    try {
      const id = await insertRace(client, race)
      if (id) {
        inserted++
        console.log(`${label} OK  ${race.name?.slice(0, 40)} | ${race.source}`)
      } else {
        skipped++
        console.log(`${label} DUP ${race.name?.slice(0, 40)}`)
      }
    } catch (e) {
      errors++
      console.log(`${label} ERR ${race.name?.slice(0, 40)} | ${e.message?.slice(0, 60)}`)
    }
  }

  if (client) await client.end()

  console.log(`\n=== 完了 ===`)
  console.log(`Inserted: ${inserted}, Skipped: ${skipped}, Errors: ${errors}`)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
