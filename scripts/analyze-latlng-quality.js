#!/usr/bin/env node
/**
 * Lat/Lng NULL analysis for Step 2-E
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
    console.log('=== Query 1: Lat/Lng NULL Analysis ===\n')

    const query1 = `
      SELECT
        COUNT(*) as total_active,
        COUNT(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 END) as has_latlng,
        COUNT(CASE WHEN latitude IS NULL OR longitude IS NULL THEN 1 END) as null_latlng,
        COUNT(CASE WHEN location IS NOT NULL AND (latitude IS NULL OR longitude IS NULL) THEN 1 END) as location_but_no_latlng
      FROM yabai_travel.events
    `
    const result1 = await client.query(query1)
    const row1 = result1.rows[0]

    console.log(`Total active events: ${row1.total_active}`)
    console.log(`Has lat/lng: ${row1.has_latlng}`)
    console.log(`NULL lat/lng: ${row1.null_latlng}`)
    console.log(`Location present but lat/lng NULL: ${row1.location_but_no_latlng}`)
    console.log()
    console.log(`Lat/lng fill rate: ${((row1.has_latlng / row1.total_active) * 100).toFixed(1)}%`)
    console.log(`Location-present but missing lat/lng: ${((row1.location_but_no_latlng / row1.total_active) * 100).toFixed(1)}% (re-geocoding candidates)`)

    console.log('\n=== Query 2: Sample 10 records (location present, lat/lng NULL) ===\n')

    const query2 = `
      SELECT id, name, location, latitude, longitude
      FROM yabai_travel.events
      WHERE location IS NOT NULL
        AND (latitude IS NULL OR longitude IS NULL)
      ORDER BY collected_at DESC
      LIMIT 10
    `
    const result2 = await client.query(query2)

    console.log('| ID | Event Name | Location | Lat | Lng |')
    console.log('|----|----|----|----|---|')

    for (const row of result2.rows) {
      const id = (row.id || 'N/A').substring(0, 8)
      const name = (row.name || 'N/A').substring(0, 35)
      const location = (row.location || 'N/A').substring(0, 40)
      const lat = row.latitude ? row.latitude.toString().substring(0, 10) : 'NULL'
      const lng = row.longitude ? row.longitude.toString().substring(0, 10) : 'NULL'
      console.log(`| ${id} | ${name.padEnd(35)} | ${location.padEnd(40)} | ${lat.padEnd(10)} | ${lng} |`)
    }

    console.log('\n=== Summary ===\n')
    console.log(`Total events: ${row1.total_active}`)
    console.log(`Lat/lng coverage: ${row1.has_latlng}/${row1.total_active} (${((row1.has_latlng / row1.total_active) * 100).toFixed(1)}%)`)
    console.log(`Re-geocoding candidates: ${row1.location_but_no_latlng} (location present but lat/lng missing)`)

  } catch (err) {
    console.error('Query error:', err.message)
    console.error('Full error:', err)
  } finally {
    await client.end()
  }
}

runQueries()
