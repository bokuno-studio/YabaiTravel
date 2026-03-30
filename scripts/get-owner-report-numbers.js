#!/usr/bin/env node
/**
 * Owner Report Numbers - Quick extraction
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
    console.log('=== Owner Report Numbers ===\n')

    // Query 1A: Total events
    const q1a = await client.query(`
      SELECT COUNT(*) as count
      FROM yabai_travel.events
    `)
    const A_total = parseInt(q1a.rows[0].count, 10)

    // Query 1C: Junk count
    const q1c = await client.query(`
      SELECT COUNT(*) as count
      FROM yabai_travel.events
      WHERE (
        official_url LIKE '%facebook.com%'
        OR official_url LIKE '%events.zoom.us%'
        OR official_url LIKE '%connect.justrunlah.com%'
        OR official_url LIKE '%vts-photo.vietnamtrailseries.com%'
        OR official_url LIKE '%/faq%'
        OR official_url LIKE '%/about-us%'
        OR official_url LIKE '%/about/%'
        OR (official_url LIKE '%marathon.tokyo%' AND (official_url LIKE '%/about/%' OR official_url LIKE '%/program/%' OR official_url LIKE '%/course/%'))
        OR (official_url LIKE '%info.runsignup.com%' AND (official_url LIKE '%/about-us/%' OR official_url LIKE '%/products/%'))
        OR (official_url LIKE '%event-organizer.jp%' AND official_url LIKE '%/faq/%')
      )
    `)
    const C_junk = parseInt(q1c.rows[0].count, 10)

    // Query 2: Categories count
    const q2 = await client.query(`
      SELECT COUNT(*) as count
      FROM yabai_travel.categories c
      JOIN yabai_travel.events e ON c.event_id = e.id
    `)
    const D_categories = parseInt(q2.rows[0].count, 10)

    // Query 3: Date/Location/Fee fulfillment
    const q3 = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(e.event_date) as has_date,
        COUNT(e.location) as has_location,
        COUNT(CASE WHEN c.entry_fee IS NOT NULL THEN 1 END) as has_fee
      FROM yabai_travel.categories c
      JOIN yabai_travel.events e ON c.event_id = e.id
    `)
    const row3 = q3.rows[0]
    const D_total = parseInt(row3.total, 10)
    const E_has_date = parseInt(row3.has_date, 10)
    const F_has_location = parseInt(row3.has_location, 10)
    const G_has_fee = parseInt(row3.has_fee, 10)

    // Query 4: Lat/Lng fulfillment (location present)
    const q4 = await client.query(`
      SELECT
        COUNT(*) as has_location,
        COUNT(CASE WHEN e.latitude IS NOT NULL AND e.longitude IS NOT NULL THEN 1 END) as has_latlng
      FROM yabai_travel.categories c
      JOIN yabai_travel.events e ON c.event_id = e.id
      WHERE e.location IS NOT NULL
    `)
    const row4 = q4.rows[0]
    const F_has_location_with_latlng = parseInt(row4.has_location, 10)
    const H_has_latlng = parseInt(row4.has_latlng, 10)
    const I_has_access = 0  // Not available in schema
    const J_has_fare = 0    // Not available in schema

    // Output
    console.log('A. Total events: ' + A_total)
    console.log('C. Junk count (estimate): ' + C_junk)
    console.log('D. Categories total: ' + D_categories)
    console.log('E. Has event_date: ' + E_has_date)
    console.log('F. Has location: ' + F_has_location)
    console.log('G. Has entry_fee: ' + G_has_fee)
    console.log('H. Has lat/lng (of location-present): ' + H_has_latlng)
    console.log('I. Has access_routes: ' + I_has_access)
    console.log('J. Has transit_fare: ' + J_has_fare)

    console.log('\n=== Calculated Rates ===\n')
    console.log(`A - C (Clean events): ${A_total - C_junk}`)
    console.log(`E/D (Date rate): ${((E_has_date / D_total) * 100).toFixed(1)}%`)
    console.log(`F/D (Location rate): ${((F_has_location / D_total) * 100).toFixed(1)}%`)
    console.log(`G/D (Fee rate): ${((G_has_fee / D_total) * 100).toFixed(1)}%`)
    console.log(`H/F (Lat/Lng rate of location-present): ${((H_has_latlng / F_has_location_with_latlng) * 100).toFixed(1)}%`)
    console.log(`I/F (Access routes rate): ${((I_has_access / F_has_location_with_latlng) * 100).toFixed(1)}%`)
    console.log(`J/F (Transit fare rate): ${((J_has_fare / F_has_location_with_latlng) * 100).toFixed(1)}%`)

  } catch (err) {
    console.error('Query error:', err.message)
    console.error('Full error:', err)
  } finally {
    await client.end()
  }
}

runQueries()
