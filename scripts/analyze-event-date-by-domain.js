#!/usr/bin/env node
/**
 * Event Date Quality Analysis by Domain (official_url)
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
    console.log('=== Query 1: Overall event_date NULL rate ===\n')

    const query1 = `
      SELECT
        COUNT(*) as total,
        COUNT(event_date) as has_date,
        COUNT(*) - COUNT(event_date) as null_date,
        ROUND(COUNT(event_date)::numeric / COUNT(*) * 100, 1) as date_rate_pct
      FROM yabai_travel.events
    `
    const result1 = await client.query(query1)
    const row1 = result1.rows[0]

    console.log(`Total events (non-archived): ${row1.total}`)
    console.log(`Has event_date: ${row1.has_date}`)
    console.log(`NULL event_date: ${row1.null_date}`)
    console.log(`Date fill rate: ${row1.date_rate_pct}%`)
    console.log(`NULL rate: ${(100 - row1.date_rate_pct).toFixed(1)}%`)

    console.log('\n=== Query 2: Event Date NULL rate by Domain (TOP 20) ===\n')

    const query2 = `
      SELECT
        SPLIT_PART(REGEXP_REPLACE(official_url, '^https?://(www\\.)?', ''), '/', 1) as domain,
        COUNT(*) as total,
        COUNT(event_date) as has_date,
        COUNT(*) - COUNT(event_date) as null_date,
        ROUND(COUNT(event_date)::numeric / COUNT(*) * 100, 1) as date_rate_pct
      FROM yabai_travel.events
      WHERE official_url IS NOT NULL
      GROUP BY 1
      HAVING COUNT(*) >= 5
      ORDER BY null_date DESC
      LIMIT 20
    `
    const result2 = await client.query(query2)

    console.log('| Domain | Total | Has Date | NULL | NULL Rate % |')
    console.log('|--------|-------|----------|------|------------|')

    for (const row of result2.rows) {
      const domain = (row.domain || 'NULL').substring(0, 40)
      const nullRate = (100 - row.date_rate_pct).toFixed(1)
      console.log(`| ${domain.padEnd(40)} | ${String(row.total).padStart(5)} | ${String(row.has_date).padStart(8)} | ${String(row.null_date).padStart(4)} | ${nullRate.padStart(9)}% |`)
    }

    console.log('\n=== Query 3: Past Events Count ===\n')

    const query3 = `
      SELECT COUNT(*) as past_events
      FROM yabai_travel.events
      WHERE event_date < CURRENT_DATE
    `
    const result3 = await client.query(query3)
    console.log(`Past events (event_date < today): ${result3.rows[0].past_events}`)

    console.log('\n=== Query 4: Sample events with NULL event_date (TOP 10) ===\n')

    const query4 = `
      SELECT name, official_url, collected_at
      FROM yabai_travel.events
      WHERE event_date IS NULL
      ORDER BY collected_at DESC
      LIMIT 10
    `
    const result4 = await client.query(query4)

    console.log('| Event Name | Official URL | Collected At |')
    console.log('|------------|--------------|--------------|')

    for (const row of result4.rows) {
      const name = (row.name || 'N/A').substring(0, 35)
      const url = (row.official_url || 'N/A').substring(0, 45)
      const collected = (row.collected_at || 'N/A').toString().substring(0, 19)
      console.log(`| ${name.padEnd(35)} | ${url.padEnd(45)} | ${collected} |`)
    }

    // Additional analysis: Top 5 domains with highest NULL rate with characteristics
    console.log('\n=== TOP 5 Domains with Highest NULL Rate (Analysis) ===\n')

    const top5 = result2.rows.slice(0, 5)
    for (const domain of top5) {
      const nullRate = (100 - domain.date_rate_pct).toFixed(1)
      console.log(`**${domain.domain}**: ${domain.null_date}/${domain.total} NULL (${nullRate}%)`)
    }

  } catch (err) {
    console.error('Query error:', err.message)
    console.error('Full error:', err)
  } finally {
    await client.end()
  }
}

runQueries()
