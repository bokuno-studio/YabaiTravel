/**
 * A-Extremo / Golden Trail の誤データを削除して再クロール
 * name と official_url の不一致を修正するための一時スクリプト
 *
 * 使い方: node scripts/crawl/fix-and-rerun.js
 */
import pg from 'pg'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  })
}

async function run() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL が未設定です')
    process.exit(1)
  }

  const client = new pg.Client({ connectionString: url })
  await client.connect()

  try {
    const del = await client.query(`
      UPDATE yabai_travel.events SET deleted_at = NOW()
      WHERE official_url LIKE '%a-extremo.com%' OR official_url LIKE '%goldentrailseries.com%'
      RETURNING id
    `)
    console.log(`Soft-deleted ${del.rowCount} events`)
  } finally {
    await client.end()
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
