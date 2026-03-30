#!/usr/bin/env node
/**
 * Database analysis script for official_url contamination investigation
 * Executes queries to identify which domains are registered as official_url
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

// Homepage URL pattern: domain root with optional /
const isHomepageUrl = (url) => /^https?:\/\/[^/]+\/?$/.test(url)

// Extract domain from URL
const extractDomain = (url) => {
  try {
    const u = new URL(url)
    return u.hostname
  } catch {
    return null
  }
}

async function runQueries() {
  await client.connect()
  try {
    console.log('=== Query 1: Homepage URLs in events table ===\n')

    // Query 1: Get all homepage URLs grouped by domain
    const query1 = `
      SELECT
        official_url,
        COUNT(*) as count
      FROM yabai_travel.events
      WHERE official_url IS NOT NULL
      GROUP BY official_url
      ORDER BY count DESC
      LIMIT 50
    `
    const result1 = await client.query(query1)

    // Filter to homepage URLs and group by domain
    const homepageUrls = result1.rows.filter(row => isHomepageUrl(row.official_url))
    const domainBreakdown = {}

    for (const row of homepageUrls) {
      const domain = extractDomain(row.official_url)
      if (domain) {
        domainBreakdown[domain] = (domainBreakdown[domain] || 0) + row.count
      }
    }

    // Sort by count
    const sortedDomains = Object.entries(domainBreakdown)
      .sort((a, b) => b[1] - a[1])

    console.log('Homepage URLs by domain (top 30):')
    let totalHomepageUrls = 0
    for (let i = 0; i < Math.min(30, sortedDomains.length); i++) {
      const [domain, count] = sortedDomains[i]
      const numCount = parseInt(count, 10)
      console.log(`${i + 1}. ${domain}: ${numCount}`)
      totalHomepageUrls += numCount
    }

    console.log(`\nTotal homepage URLs in events: ${totalHomepageUrls}`)

    // Specific domains query
    console.log('\n=== Specific problematic domains ===\n')
    const specificQuery = `
      SELECT
        official_url,
        COUNT(*) as count
      FROM yabai_travel.events
      WHERE official_url ~ '^https?://(trackfesta\\.com|up-run\\.jp|marathon\\.tokyo)/?$'
      GROUP BY official_url
      ORDER BY count DESC
    `
    const result2 = await client.query(specificQuery)
    console.log('Trackfesta / Up-Run / Marathon.Tokyo:')
    let specificTotal = 0
    for (const row of result2.rows) {
      const numCount = parseInt(row.count, 10)
      console.log(`- ${row.official_url}: ${numCount}`)
      specificTotal += numCount
    }
    console.log(`Total: ${specificTotal}`)

    // Query 3: Categories with partial data (entry_fee IS NULL)
    console.log('\n=== Query 2: Partial categories with homepage URLs ===\n')
    const query3 = `
      SELECT
        e.official_url,
        COUNT(*) as count
      FROM yabai_travel.categories c
      JOIN yabai_travel.events e ON c.event_id = e.id
      WHERE c.entry_fee IS NULL
        AND c.attempt_count > 0
        AND e.official_url IS NOT NULL
      GROUP BY e.official_url
      ORDER BY count DESC
      LIMIT 30
    `
    const result3 = await client.query(query3)

    console.log('Homepage URLs in partial categories (top 30):')
    let partialHomepageCount = 0
    for (const row of result3.rows) {
      const numCount = parseInt(row.count, 10)
      if (isHomepageUrl(row.official_url)) {
        console.log(`- ${row.official_url}: ${numCount}`)
        partialHomepageCount += numCount
      }
    }
    console.log(`\nTotal partial categories with homepage URLs: ${partialHomepageCount}`)

    // Query 4: UTMB domains analysis (suspected major source)
    console.log('\n=== UTMB World Series subdomains ===\n')
    const utmbQuery = `
      SELECT
        official_url,
        COUNT(*) as count
      FROM yabai_travel.events
      WHERE official_url ~ '\.utmb\.world/?$'
      GROUP BY official_url
      ORDER BY count DESC
    `
    const result4 = await client.query(utmbQuery)
    console.log('UTMB subdomains:')
    let utmbTotal = 0
    for (const row of result4.rows) {
      const numCount = parseInt(row.count, 10)
      console.log(`- ${row.official_url}: ${numCount}`)
      utmbTotal += numCount
    }
    console.log(`\nTotal UTMB entries: ${utmbTotal}`)

    // Summary stats
    console.log('\n=== SUMMARY ===\n')
    const totalEventsResult = await client.query('SELECT COUNT(*) as count FROM yabai_travel.events WHERE official_url IS NOT NULL')
    const totalEvents = parseInt(totalEventsResult.rows[0].count, 10)
    console.log(`Total events with official_url: ${totalEvents}`)
    console.log(`Total homepage URLs (all events): ${totalHomepageUrls}`)
    console.log(`Homepage URL % of all official_url: ${((totalHomepageUrls * 100) / totalEvents).toFixed(1)}%`)

  } catch (err) {
    console.error('Query error:', err.message)
    console.error('Full error:', err)
  } finally {
    await client.end()
  }
}

runQueries()
