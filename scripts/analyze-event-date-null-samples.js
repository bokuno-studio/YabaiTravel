#!/usr/bin/env node
/**
 * Event Date NULL Random Sample (10件)
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
    console.log('=== Event Date NULL - Random Sample (10 items) ===\n')

    const query = `
      SELECT
        name,
        official_url,
        SPLIT_PART(REGEXP_REPLACE(official_url, '^https?://(www\\.)?', ''), '/', 1) as domain,
        location,
        race_type,
        collected_at
      FROM yabai_travel.events
      WHERE event_date IS NULL
      ORDER BY RANDOM()
      LIMIT 10
    `
    const result = await client.query(query)

    console.log('| No | Event Name | Domain | Official URL | Location | Race Type | Collected |')
    console.log('|----|-----------|--------|--------------|----------|-----------|-----------|')

    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows[i]
      const name = (row.name || 'N/A').substring(0, 30)
      const domain = (row.domain || 'NULL').substring(0, 20)
      const url = (row.official_url || 'N/A').substring(0, 50)
      const location = (row.location || 'NULL').substring(0, 25)
      const raceType = (row.race_type || 'other').substring(0, 10)
      const collected = (row.collected_at || 'N/A').toString().substring(0, 10)

      console.log(`| ${i+1} | ${name.padEnd(30)} | ${domain.padEnd(20)} | ${url.padEnd(50)} | ${location.padEnd(25)} | ${raceType.padEnd(10)} | ${collected} |`)
    }

    console.log('\n=== Detailed URL List (for manual verification) ===\n')
    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows[i]
      console.log(`${i+1}. ${row.name}`)
      console.log(`   URL: ${row.official_url}`)
      console.log(`   Domain: ${row.domain}`)
      console.log(`   Location: ${row.location}`)
      console.log(`   Race Type: ${row.race_type}`)
      console.log()
    }

  } catch (err) {
    console.error('Query error:', err.message)
    console.error('Full error:', err)
  } finally {
    await client.end()
  }
}

runQueries()
