#!/usr/bin/env node
/**
 * Location and Date Quality Analysis for #445 investigation
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
    console.log('=== Query 1: Location / Latitude / Longitude Fulfillment ===\n')

    const query1 = `
      SELECT
        count(*) as total,
        count(location) as has_location,
        round(count(location)::numeric / count(*) * 100, 1) as location_rate,
        count(latitude) as has_lat,
        round(count(latitude)::numeric / count(*) * 100, 1) as lat_rate,
        count(longitude) as has_lng,
        round(count(longitude)::numeric / count(*) * 100, 1) as lng_rate,
        count(*) FILTER (WHERE latitude = 0 OR longitude = 0) as zero_coords,
        count(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND latitude != 0 AND longitude != 0) as valid_coords
      FROM yabai_travel.events
    `
    const result1 = await client.query(query1)
    const row1 = result1.rows[0]

    console.log(`Total events: ${row1.total}`)
    console.log(`Has location: ${row1.has_location} (${row1.location_rate}%)`)
    console.log(`Has latitude: ${row1.has_lat} (${row1.lat_rate}%)`)
    console.log(`Has longitude: ${row1.has_lng} (${row1.lng_rate}%)`)
    console.log(`Zero coords (0,0 or only one is 0): ${row1.zero_coords}`)
    console.log(`Valid coords (non-zero): ${row1.valid_coords}`)

    console.log('\n=== Query 2: Sample 5 events with 0,0 coordinates ===\n')

    const query2 = `
      SELECT id, name, location, latitude, longitude
      FROM yabai_travel.events
      WHERE (latitude = 0 OR longitude = 0)
        AND latitude IS NOT NULL
      LIMIT 5
    `
    const result2 = await client.query(query2)

    if (result2.rows.length === 0) {
      console.log('No events with 0,0 coordinates found.')
    } else {
      for (const row of result2.rows) {
        console.log(`ID: ${row.id}`)
        console.log(`  Name: ${row.name}`)
        console.log(`  Location: ${row.location}`)
        console.log(`  Coords: ${row.latitude}, ${row.longitude}`)
        console.log()
      }
    }

    console.log('=== Query 3: Event date fulfillment ===\n')

    const query3 = `
      SELECT
        count(*) as total,
        count(event_date) as has_date,
        round(count(event_date)::numeric / count(*) * 100, 1) as date_rate,
        count(*) FILTER (WHERE event_date >= CURRENT_DATE) as future_events,
        count(*) FILTER (WHERE event_date < CURRENT_DATE) as past_events,
        count(*) FILTER (WHERE event_date IS NULL) as no_date
      FROM yabai_travel.events
    `
    const result3 = await client.query(query3)
    const row3 = result3.rows[0]

    console.log(`Total events: ${row3.total}`)
    console.log(`Has event_date: ${row3.has_date} (${row3.date_rate}%)`)
    console.log(`Future events: ${row3.future_events}`)
    console.log(`Past events: ${row3.past_events}`)
    console.log(`No date: ${row3.no_date}`)

    console.log('\n=== Query 4: Null location sample (5 events) ===\n')

    const query4 = `
      SELECT id, name, location, latitude, longitude
      FROM yabai_travel.events
      WHERE location IS NULL
      LIMIT 5
    `
    const result4 = await client.query(query4)

    if (result4.rows.length === 0) {
      console.log('No events with NULL location found.')
    } else {
      for (const row of result4.rows) {
        console.log(`ID: ${row.id}`)
        console.log(`  Name: ${row.name}`)
        console.log(`  Location: ${row.location}`)
        console.log(`  Coords: ${row.latitude}, ${row.longitude}`)
        console.log()
      }
    }

    console.log('=== Summary Statistics ===\n')
    console.log(`Location fill rate: ${row1.location_rate}%`)
    console.log(`Valid geocoding rate (non-zero): ${row1.valid_coords}/${row1.total} (${((row1.valid_coords / row1.total) * 100).toFixed(1)}%)`)
    console.log(`Date fill rate: ${row3.date_rate}%`)
    console.log(`Future events available: ${row3.future_events}/${row3.total} (${((row3.future_events / row3.total) * 100).toFixed(1)}%)`)

  } catch (err) {
    console.error('Query error:', err.message)
    console.error('Full error:', err)
  } finally {
    await client.end()
  }
}

runQueries()
