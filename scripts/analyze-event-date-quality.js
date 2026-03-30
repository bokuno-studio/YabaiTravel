#!/usr/bin/env node
/**
 * Event Date Quality Analysis by Source
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
    console.log('=== Query 1: Event Date NULL rate by Source (TOP 20) ===\n')

    const query1 = `
      SELECT
        source,
        COUNT(*) as total,
        COUNT(event_date) as has_date,
        COUNT(*) - COUNT(event_date) as null_date,
        ROUND(COUNT(event_date)::numeric / COUNT(*) * 100, 1) as date_rate_pct
      FROM yabai_travel.events
      WHERE status != 'archived'
      GROUP BY source
      ORDER BY null_date DESC
      LIMIT 20
    `
    const result1 = await client.query(query1)

    console.log('| Source | Total | Has Date | NULL | NULL Rate |')
    console.log('|--------|-------|----------|------|-----------|')

    for (const row of result1.rows) {
      const source = row.source || 'NULL'
      console.log(`| ${source.padEnd(25)} | ${String(row.total).padStart(5)} | ${String(row.has_date).padStart(8)} | ${String(row.null_date).padStart(4)} | ${String(row.date_rate_pct).padStart(7)}% |`)
    }

    console.log('\n=== Query 2: Overall Event Date Statistics ===\n')

    const query2 = `
      SELECT
        COUNT(*) as total,
        COUNT(event_date) as has_date,
        COUNT(*) - COUNT(event_date) as null_date,
        ROUND(COUNT(event_date)::numeric / COUNT(*) * 100, 1) as date_rate_pct
      FROM yabai_travel.events
      WHERE status != 'archived'
    `
    const result2 = await client.query(query2)
    const row2 = result2.rows[0]

    console.log(`Total events (non-archived): ${row2.total}`)
    console.log(`Has event_date: ${row2.has_date}`)
    console.log(`NULL event_date: ${row2.null_date}`)
    console.log(`Date fill rate: ${row2.date_rate_pct}%`)

    console.log('\n=== Query 3: Past Events Count ===\n')

    const query3 = `
      SELECT COUNT(*) as past_count
      FROM yabai_travel.events
      WHERE status != 'archived'
        AND event_date < CURRENT_DATE
    `
    const result3 = await client.query(query3)
    const pastCount = result3.rows[0].past_count

    console.log(`Past events (event_date < today): ${pastCount}`)

    // Additional analysis: TOP 5 NULL sources with sample records
    console.log('\n=== TOP 5 Sources with Highest NULL Rate (with samples) ===\n')

    const top5Sources = result1.rows.slice(0, 5)

    for (const source of top5Sources) {
      console.log(`\n**${source.source || 'NULL'}**: ${source.null_date}/${source.total} NULL (${100 - source.date_rate_pct}%)`)

      // Get sample records for this source
      const sampleQuery = `
        SELECT id, name, event_date, location
        FROM yabai_travel.events
        WHERE status != 'archived'
          AND source = $1
          AND event_date IS NULL
        LIMIT 3
      `
      const sampleResult = await client.query(sampleQuery, [source.source])

      if (sampleResult.rows.length > 0) {
        for (const sample of sampleResult.rows) {
          console.log(`  - ${sample.name?.slice(0, 50)}: location="${sample.location}"`)
        }
      }
    }

  } catch (err) {
    console.error('Query error:', err.message)
    console.error('Full error:', err)
  } finally {
    await client.end()
  }
}

runQueries()
