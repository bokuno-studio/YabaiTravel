#!/usr/bin/env node
/**
 * Follow-up Analysis: VTS-Photo origin and Noise records detection
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
    console.log('=== Query 1: VTS-Photo.vietnamtrailseries.com records (15 items) ===\n')

    const query1 = `
      SELECT name, official_url, entry_url, collected_at
      FROM yabai_travel.events
      WHERE (official_url LIKE '%vts-photo%' OR entry_url LIKE '%vts-photo%')
      ORDER BY collected_at DESC
      LIMIT 15
    `
    const result1 = await client.query(query1)

    console.log(`Total vts-photo records: ${result1.rows.length}\n`)
    console.log('| Event Name | Official URL | Entry URL | Collected At |')
    console.log('|------------|--------------|-----------|--------------|')

    for (const row of result1.rows) {
      const name = (row.name || 'N/A').substring(0, 40)
      const officialUrl = (row.official_url || 'N/A').substring(0, 50)
      const entryUrl = (row.entry_url || 'N/A').substring(0, 40)
      const collected = (row.collected_at || 'N/A').toString().substring(0, 19)
      console.log(`| ${name.padEnd(40)} | ${officialUrl.padEnd(50)} | ${entryUrl.padEnd(40)} | ${collected} |`)
    }

    console.log('\n=== Query 2: FAQ/Contact/Support/About noise records ===\n')

    const query2 = `
      SELECT COUNT(*) as noise_count
      FROM yabai_travel.events
      WHERE (
        official_url LIKE '%/faq%'
        OR official_url LIKE '%/contact%'
        OR official_url LIKE '%/support%'
        OR official_url LIKE '%/about%'
        OR name ILIKE '%timer%'
        OR name ILIKE '%request a call%'
        OR name ILIKE '%features%'
      )
    `
    const result2 = await client.query(query2)
    const noiseCount = result2.rows[0].noise_count

    console.log(`Total noise records (FAQ/Contact/Support/About patterns): ${noiseCount}`)
    console.log(`Percentage of total events: ${((noiseCount / 2979) * 100).toFixed(2)}%`)

    console.log('\n=== Query 3: Sample noise records (10 items) ===\n')

    const query3 = `
      SELECT name, official_url, entry_url
      FROM yabai_travel.events
      WHERE (
        official_url LIKE '%/faq%'
        OR official_url LIKE '%/contact%'
        OR official_url LIKE '%/support%'
        OR official_url LIKE '%/about%'
        OR name ILIKE '%timer%'
        OR name ILIKE '%request a call%'
        OR name ILIKE '%features%'
      )
      ORDER BY name
      LIMIT 10
    `
    const result3 = await client.query(query3)

    console.log('| Event Name | Official URL | Entry URL |')
    console.log('|------------|--------------|-----------|')

    for (const row of result3.rows) {
      const name = (row.name || 'N/A').substring(0, 40)
      const officialUrl = (row.official_url || 'N/A').substring(0, 50)
      const entryUrl = (row.entry_url || 'N/A').substring(0, 40)
      console.log(`| ${name.padEnd(40)} | ${officialUrl.padEnd(50)} | ${entryUrl.padEnd(40)} |`)
    }

    console.log('\n=== Summary ===\n')
    console.log(`VTS-Photo records: ${result1.rows.length}`)
    console.log(`Noise records (FAQ/Support patterns): ${noiseCount}`)
    console.log(`Total noise % of dataset: ${((noiseCount / 2979) * 100).toFixed(2)}%`)

  } catch (err) {
    console.error('Query error:', err.message)
    console.error('Full error:', err)
  } finally {
    await client.end()
  }
}

runQueries()
