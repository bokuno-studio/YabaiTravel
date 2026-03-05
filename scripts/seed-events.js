/**
 * 初期データ投入スクリプト
 * data/seed.json を読み込み、yabai_travel の events, access_routes, accommodations, categories に INSERT
 * .env.local があれば読み込む（Vercel では DATABASE_URL を環境変数に設定）
 */
import pg from 'pg'
import { existsSync, readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, resolve } from 'path'

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
  console.error('DATABASE_URL が設定されていません。')
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
    await client.query('DELETE FROM yabai_travel.categories')
    await client.query('DELETE FROM yabai_travel.access_routes')
    await client.query('DELETE FROM yabai_travel.accommodations')
    await client.query('DELETE FROM yabai_travel.events')

    for (const item of items) {
      const eventResult = await client.query(
        `INSERT INTO yabai_travel.events (
          name, event_date, location, race_type, official_url, entry_url,
          participant_count, stay_status, weather_forecast,
          entry_start, entry_end, entry_start_typical, entry_end_typical,
          reception_place, start_place, prohibited_items, course_map_url, furusato_nozei_url
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING id`,
        [
          item.name,
          item.event_date,
          item.location ?? null,
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
          item.course_map_url ?? null,
          item.furusato_nozei_url ?? null,
        ]
      )
      const eventId = eventResult.rows[0].id

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
