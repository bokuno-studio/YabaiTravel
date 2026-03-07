/**
 * DB リセット（全削除のみ。seed は投入しない）
 * クロール前にクリーンな状態にする用途
 */
import pg from 'pg'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath) && !process.env.DATABASE_URL) {
  readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  })
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error('*** エラー: DATABASE_URL が設定されていません ***')
  process.exit(1)
}

const client = new pg.Client({ connectionString: url })

async function run() {
  try {
    await client.connect()
    await client.query('DELETE FROM yabai_travel.course_map_files')
    await client.query('DELETE FROM yabai_travel.categories')
    await client.query('DELETE FROM yabai_travel.access_routes')
    await client.query('DELETE FROM yabai_travel.accommodations')
    await client.query('DELETE FROM yabai_travel.events')
    await client.query('DELETE FROM yabai_travel.event_series')
    console.log('DB リセット完了')
  } finally {
    await client.end()
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
