#!/usr/bin/env node
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

async function checkSchema() {
  await client.connect()
  try {
    const result = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'categories'
      ORDER BY ordinal_position
    `)
    console.log('Categories columns with "fee", "fare", or "entry":')
    for (const row of result.rows) {
      if (row.column_name.includes('fee') || row.column_name.includes('fare') || row.column_name.includes('entry')) {
        console.log(`  ${row.column_name}: ${row.data_type}`)
      }
    }
  } finally {
    await client.end()
  }
}

checkSchema()
