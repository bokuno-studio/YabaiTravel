/**
 * 初期データ投入スクリプト
 * data/seed.json を読み込み、yabai_travel の events, access_routes, accommodations, categories に INSERT
 * コースマップの PDF/GPX/画像は URL から DL して Supabase Storage (course-maps) にアップロード
 * .env.local があれば読み込む（Vercel では DATABASE_URL を環境変数に設定）
 */
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, resolve } from 'path'

const DOWNLOAD_EXT = ['.pdf', '.gpx', '.png', '.jpg', '.jpeg', '.webp', '.gif']
const STORAGE_BUCKET = 'course-maps'

/** URL から DL 可能なファイルか */
function isDownloadable(url) {
  try {
    const pathname = new URL(url).pathname
    const ext = pathname.slice(pathname.lastIndexOf('.')).toLowerCase()
    return DOWNLOAD_EXT.includes(ext)
  } catch {
    return false
  }
}

/** URL からファイル名を取得（デコード済み） */
function filenameFromUrl(url) {
  try {
    const pathname = new URL(url).pathname
    const basename = pathname.split('/').pop()
    return decodeURIComponent(basename || 'file')
  } catch {
    return 'file'
  }
}

/**
 * URL から DL して Supabase Storage にアップロード。成功時は公開 URL を返す
 * @param {string} url - ダウンロード元 URL
 * @param {string} eventId - イベント ID（パス用）
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Service Role クライアント
 * @returns {Promise<string>} 公開 URL
 */
async function uploadCourseMapToStorage(url, eventId, supabase) {
  const filename = filenameFromUrl(url)
  const storagePath = `${eventId}/${filename}`
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`DL失敗 ${url}: ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, buf, {
    contentType: res.headers.get('content-type') || 'application/octet-stream',
    upsert: true,
  })
  if (error) throw new Error(`Storage アップロード失敗: ${error.message}`)
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath)
  return data.publicUrl
}

const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath) && !process.env.DATABASE_URL) {
  readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  })
}

const __dirname = dirname(fileURLToPath(import.meta.url))

const url = process.env.DATABASE_URL
if (!url) {
  console.error('')
  console.error('*** エラー: DATABASE_URL が設定されていません ***')
  console.error('Vercel: Project Settings → Environment Variables → DATABASE_URL を追加')
  console.error('ローカル: .env.local に DATABASE_URL を設定')
  console.error('')
  process.exit(1)
}

const client = new pg.Client({ connectionString: url })

async function run() {
  const seedPath = join(__dirname, '../data/seed.json')
  const raw = readFileSync(seedPath, 'utf8')
  const items = JSON.parse(raw)

  try {
    await client.connect()

    // 既存データを削除（開発用。本番では使わない想定）
    await client.query('DELETE FROM yabai_travel.course_map_files')
    await client.query('DELETE FROM yabai_travel.categories')
    await client.query('DELETE FROM yabai_travel.access_routes')
    await client.query('DELETE FROM yabai_travel.accommodations')
    await client.query('DELETE FROM yabai_travel.events')
    await client.query('DELETE FROM yabai_travel.event_series')

    for (const item of items) {
      // event_series を取得または作成
      let eventSeriesId = null
      if (item.event_series_name) {
        const getSeries = await client.query(
          `SELECT id FROM yabai_travel.event_series WHERE name = $1`,
          [item.event_series_name]
        )
        if (getSeries.rows.length === 0) {
          const ins = await client.query(
            `INSERT INTO yabai_travel.event_series (name) VALUES ($1) RETURNING id`,
            [item.event_series_name]
          )
          eventSeriesId = ins.rows[0].id
        } else {
          eventSeriesId = getSeries.rows[0].id
        }
      }

      const eventResult = await client.query(
        `INSERT INTO yabai_travel.events (
          name, event_date, location, country, race_type, official_url, entry_url,
          participant_count, stay_status, weather_forecast,
          entry_start, entry_end, entry_start_typical, entry_end_typical,
          reception_place, start_place, prohibited_items, furusato_nozei_url,
          event_series_id, total_cost_estimate
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        RETURNING id`,
        [
          item.name,
          item.event_date,
          item.location ?? null,
          item.country ?? null,
          item.race_type ?? null,
          item.official_url ?? null,
          item.entry_url ?? null,
          item.participant_count ?? null,
          item.stay_status ?? null,
          item.weather_forecast ?? null,
          item.entry_start ?? null,
          item.entry_end ?? null,
          item.entry_start_typical ?? null,
          item.entry_end_typical ?? null,
          item.reception_place ?? null,
          item.start_place ?? null,
          item.prohibited_items ?? null,
          item.furusato_nozei_url ?? null,
          eventSeriesId,
          item.total_cost_estimate ?? null,
        ]
      )
      const eventId = eventResult.rows[0].id

      // コースマップファイル（PDF/GPX/画像は DL → Supabase Storage にアップロード、それ以外は外部リンク）
      // SKIP_COURSE_MAP_DOWNLOAD=1 の場合は DL をスキップし外部 URL をそのまま使用（後方互換）
      const skipDownload = process.env.SKIP_COURSE_MAP_DOWNLOAD === '1'
      const supabaseUrl = process.env.VITE_SUPABASE_URL
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      const supabase = supabaseUrl && supabaseServiceKey
        ? createClient(supabaseUrl, supabaseServiceKey)
        : null

      for (const cm of item.course_map_files ?? []) {
        let filePath
        if (cm.url) {
          if (!skipDownload && supabase && isDownloadable(cm.url)) {
            try {
              filePath = await uploadCourseMapToStorage(cm.url, eventId, supabase)
              console.log(`  Storage: ${cm.display_name ?? filenameFromUrl(cm.url)}`)
            } catch (e) {
              console.warn(`  アップロード失敗 ${cm.url}:`, e.message)
              filePath = cm.url
            }
          } else {
            filePath = cm.url
          }
        } else {
          // filename のみ（ローカルファイル想定）の場合は従来のパス形式
          filePath = `/course-maps/${eventId}/${cm.filename}`
        }
        await client.query(
          `INSERT INTO yabai_travel.course_map_files (event_id, file_path, year, display_name)
           VALUES ($1, $2, $3, $4)`,
          [eventId, filePath, cm.year ?? null, cm.display_name ?? null]
        )
      }

      for (const ar of item.access_routes ?? []) {
        await client.query(
          `INSERT INTO yabai_travel.access_routes (
            event_id, direction, route_detail, total_time_estimate, cost_estimate,
            cash_required, booking_url, shuttle_available, taxi_estimate
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            eventId,
            ar.direction,
            ar.route_detail ?? null,
            ar.total_time_estimate ?? null,
            ar.cost_estimate ?? null,
            ar.cash_required ?? false,
            ar.booking_url ?? null,
            ar.shuttle_available ?? null,
            ar.taxi_estimate ?? null,
          ]
        )
      }

      for (const acc of item.accommodations ?? []) {
        await client.query(
          `INSERT INTO yabai_travel.accommodations (
            event_id, recommended_area, avg_cost_3star
          ) VALUES ($1, $2, $3)`,
          [
            eventId,
            acc.recommended_area ?? null,
            acc.avg_cost_3star ?? null,
          ]
        )
      }

      for (const cat of item.categories ?? []) {
        await client.query(
          `INSERT INTO yabai_travel.categories (
            event_id, name, stay_status, distance_km, elevation_gain, start_time, reception_end,
            reception_place, start_place, finish_rate, time_limit, cutoff_times,
            required_pace, required_climb_pace, mandatory_gear, recommended_gear,
            prohibited_items, poles_allowed, entry_fee
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
          `,
          [
            eventId,
            cat.name,
            cat.stay_status ?? null,
            cat.distance_km ?? null,
            cat.elevation_gain ?? null,
            cat.start_time ?? null,
            cat.reception_end ?? null,
            cat.reception_place ?? null,
            cat.start_place ?? null,
            cat.finish_rate ?? null,
            cat.time_limit ?? null,
            cat.cutoff_times ? JSON.stringify(cat.cutoff_times) : null,
            cat.required_pace ?? null,
            cat.required_climb_pace ?? null,
            cat.mandatory_gear ?? null,
            cat.recommended_gear ?? null,
            cat.prohibited_items ?? null,
            cat.poles_allowed ?? null,
            cat.entry_fee ?? null,
          ]
        )
      }
    }
    console.log(`${items.length} 件のイベントを投入しました。`)
  } finally {
    await client.end()
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
