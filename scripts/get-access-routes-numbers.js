#!/usr/bin/env node
/**
 * Access Routes Numbers - I/J extraction
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
    console.log('=== Access Routes Analysis ===\n')

    // Check if access_routes table exists and has fare columns
    console.log('Checking access_routes table schema...\n')
    const schemaCheck = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'access_routes'
      ORDER BY ordinal_position
    `)

    if (schemaCheck.rows.length === 0) {
      console.log('access_routes table not found in information_schema')
      console.log('Attempting to query access_routes directly...\n')
    } else {
      console.log('access_routes columns:')
      for (const row of schemaCheck.rows) {
        console.log(`  ${row.column_name}: ${row.data_type}`)
      }
      console.log()
    }

    // Query I: access_routes count (location present)
    const queryI = `
      SELECT
        COUNT(DISTINCT e.id) as F_location_events,
        COUNT(DISTINCT ar.event_id) as I_has_access_routes
      FROM yabai_travel.events e
      LEFT JOIN yabai_travel.access_routes ar ON ar.event_id = e.id
      WHERE e.location IS NOT NULL
    `

    const resultI = await client.query(queryI)
    const row = resultI.rows[0]
    const F_location_events = parseInt(row.F_location_events, 10)
    const I_has_access_routes = parseInt(row.I_has_access_routes, 10)

    console.log('=== I: Access Routes ===\n')
    console.log(`F. Events with location: ${F_location_events}`)
    console.log(`I. Has access_routes: ${I_has_access_routes}`)
    console.log(`I/F (Access routes rate): ${((I_has_access_routes / F_location_events) * 100).toFixed(1)}%`)

    // Query J: fare column check
    console.log('\n=== J: Transit Fare ===\n')

    const fareCols = schemaCheck.rows
      .map(r => r.column_name)
      .filter(c => c.includes('fare') || c.includes('cost') || c.includes('price'))

    if (fareCols.length === 0) {
      console.log('No fare/cost/price columns found in access_routes')
      console.log('J. Has transit fare: 0 (N/A)')
    } else {
      console.log(`Fare columns found: ${fareCols.join(', ')}`)

      // Try to count non-null fare values
      for (const col of fareCols) {
        const fareQuery = `
          SELECT COUNT(DISTINCT event_id) as fare_count
          FROM yabai_travel.access_routes
          WHERE "${col}" IS NOT NULL
        `
        try {
          const fareResult = await client.query(fareQuery)
          const fareCount = parseInt(fareResult.rows[0].fare_count, 10)
          console.log(`J. Has ${col}: ${fareCount}`)
        } catch (err) {
          console.log(`Error querying ${col}: ${err.message}`)
        }
      }
    }

  } catch (err) {
    console.error('Error:', err.message)
  } finally {
    await client.end()
  }
}

runQueries()
