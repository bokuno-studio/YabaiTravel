import pg from 'pg'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  })
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

// レース タイプ別件数
const typeRes = await client.query(`
  SELECT race_type, COUNT(*) as count
  FROM yabai_travel.events
  WHERE race_type IS NOT NULL
  GROUP BY race_type
  ORDER BY count DESC
`)

console.log('\n📊 レースタイプ別件数:\n')
typeRes.rows.forEach(r => {
  console.log(`  ${r.race_type}: ${r.count} 件`)
})

// 国・地域別件数
const countryRes = await client.query(`
  SELECT country, COUNT(*) as count
  FROM yabai_travel.events
  WHERE country IS NOT NULL
  GROUP BY country
  ORDER BY count DESC
`)

console.log('\n🌍 国・地域別件数:\n')
countryRes.rows.forEach(r => {
  console.log(`  ${r.country}: ${r.count} 件`)
})

await client.end()
