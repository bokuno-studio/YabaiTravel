#!/usr/bin/env node
/**
 * Event Date NULL 349件の内訳分類
 * ①構造的限界 ②ゴミデータ ③LLM抽出失敗 の比率把握
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

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
})

async function runQueries() {
  await client.connect()
  try {
    console.log('=== Query 1: NULL率高ドメイン TOP 10 ===\n')

    const query1 = `
      SELECT
        SPLIT_PART(REGEXP_REPLACE(official_url, '^https?://(www\\.)?', ''), '/', 1) as domain,
        COUNT(*) as null_count,
        MIN(name) as name_sample
      FROM yabai_travel.events
      WHERE event_date IS NULL
        AND official_url IS NOT NULL
      GROUP BY 1
      ORDER BY null_count DESC
      LIMIT 10
    `
    const result1 = await client.query(query1)

    console.log('| Domain | NULL Count | Sample Event |')
    console.log('|--------|-----------|---|')

    let top10Total = 0
    for (const row of result1.rows) {
      const domain = (row.domain || 'NULL').substring(0, 40)
      const count = parseInt(row.null_count, 10)
      const name = (row.name_sample || 'N/A').substring(0, 50)
      console.log(`| ${domain.padEnd(40)} | ${count.toString().padStart(10)} | ${name} |`)
      top10Total += count
    }

    console.log(`\nTotal in TOP 10: ${top10Total}`)

    console.log('\n=== Query 2: event_date NULL AND location NULL (ゴミ度が高い) ===\n')

    const query2 = `
      SELECT COUNT(*) as both_null
      FROM yabai_travel.events
      WHERE event_date IS NULL
        AND location IS NULL
    `
    const result2 = await client.query(query2)
    const bothNull = parseInt(result2.rows[0].both_null, 10)

    console.log(`Both NULL (event_date + location): ${bothNull}`)
    console.log(`Percentage of total NULL: ${((bothNull / 349) * 100).toFixed(1)}%`)

    console.log('\n=== Query 3: event_date NULL by race_type ===\n')

    const query3 = `
      SELECT race_type, COUNT(*) as cnt
      FROM yabai_travel.events
      WHERE event_date IS NULL
      GROUP BY race_type
      ORDER BY cnt DESC
    `
    const result3 = await client.query(query3)

    console.log('| Race Type | Count |')
    console.log('|-----------|-------|')

    for (const row of result3.rows) {
      const raceType = (row.race_type || 'NULL').substring(0, 25)
      const count = parseInt(row.cnt, 10)
      console.log(`| ${raceType.padEnd(25)} | ${count.toString().padStart(5)} |`)
    }

    console.log('\n=== Analysis Summary ===\n')
    console.log(`Total event_date NULL: 349`)
    console.log(`TOP 10 domains: ${top10Total} (${((top10Total / 349) * 100).toFixed(1)}%)`)
    console.log(`Both NULL (date+location): ${bothNull} (${((bothNull / 349) * 100).toFixed(1)}%)`)
    console.log(`race_type = 'other': ${(result3.rows.find(r => r.race_type === 'other')?.cnt || 0)} (potential noise indicator)`)

  } catch (err) {
    console.error('Query error:', err.message)
    console.error('Full error:', err)
  } finally {
    await client.end()
  }
}

runQueries()
