import fs from 'fs';
import path from 'path';
import pg from 'pg';
const { Client } = pg;

// Parse all loop logs
async function parseLogsForPatterns() {
  const logsDir = '/tmp';
  const logFiles = fs.readdirSync(logsDir)
    .filter(f => f.match(/enrich-loop-20260330-15\d{4}\.log/))
    .sort();

  const results = [];

  for (const file of logFiles) {
    const content = fs.readFileSync(path.join(logsDir, file), 'utf-8');
    const lines = content.split('\n');

    let currentRace = null;
    let currentCategory = null;
    let status = null;
    let fetchMethod = null;
    let errorType = null;
    let hasError403 = false;
    let hasFetchFailed = false;
    let hasTavily1 = false;
    let hasTavily2 = false;
    let hasEntryFee = false;

    for (const line of lines) {
      // Track OK/ERR
      if (line.match(/OK\s+(.+)/)) {
        const match = line.match(/OK\s+(.+)/);
        status = 'OK';
        currentCategory = match[1].trim();
      } else if (line.match(/ERR\s+(.+)/)) {
        const match = line.match(/ERR\s+(.+)/);
        status = 'ERR';
        currentCategory = match[1].trim();
      }

      // Track fetch method
      if (line.includes('[html-fetch]')) {
        if (line.includes('403')) {
          hasError403 = true;
        } else if (line.includes('fetch failed')) {
          hasFetchFailed = true;
        }
      }

      // Track Tavily usage
      if (line.includes('[tavily-1]')) {
        hasTavily1 = true;
      }
      if (line.includes('[tavily-2]')) {
        hasTavily2 = true;
      }

      // Check if entry_fee was obtained
      if (line.includes('[tavily-2]') && line.includes('missing: entry_fee')) {
        hasEntryFee = false;
      } else if (currentCategory && status && line.match(/OK\s+/)) {
        hasEntryFee = true;
      }

      // Save result when we see the summary line
      if (line.match(/完了: OK \d+ \/ ERR \d+/)) {
        // Extract loop number from filename
        const loopNum = logFiles.indexOf(file) + 1;
        break;
      }
    }

    // Parse each race result from the log
    const raceLines = content.match(/\[tavily-\d\]|\[html-fetch\]|OK\s+|ERR\s+/g) || [];
  }

  return results;
}

// Query database for recent processing results
async function queryProcessingResults() {
  const dbUrl = new URL(process.env.DATABASE_URL);
  const client = new Client({
    user: dbUrl.username,
    password: dbUrl.password,
    host: dbUrl.hostname,
    port: dbUrl.port || 5432,
    database: dbUrl.pathname.replace('/', ''),
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('Connected to database\n');

    // Get recent processing results
    const results = await client.query(`
      SELECT
        c.id,
        c.name as category_name,
        e.name as event_name,
        c.entry_fee,
        c.start_time,
        c.elevation_gain,
        c.collected_at,
        c.attempt_count,
        c.last_error_type,
        c.last_error_message,
        c.updated_at
      FROM yabai_travel.categories c
      JOIN yabai_travel.events e ON c.event_id = e.id
      WHERE c.updated_at > '2026-03-30'
      ORDER BY c.updated_at DESC
      LIMIT 150
    `);

    console.log('=== RECENT PROCESSING RESULTS (Last 100) ===\n');
    console.log(`Total records: ${results.rows.length}\n`);

    // Analyze patterns
    const raceTypeStats = {};
    const statusStats = { success: 0, failure: 0 };
    const errorTypeStats = {};

    for (const row of results.rows) {
      const isSuccess = row.collected_at !== null;
      if (isSuccess) {
        statusStats.success++;
      } else {
        statusStats.failure++;
        const errType = row.last_error_type || 'unknown';
        if (!errorTypeStats[errType]) {
          errorTypeStats[errType] = 0;
        }
        errorTypeStats[errType]++;
      }

      // Race type tracking (rough heuristic from category name)
      let raceType = 'Other';
      const name = (row.category_name || '').toLowerCase();
      if (name.includes('backyard')) raceType = 'Backyard Ultra';
      else if (name.includes('ultra') || name.includes('ultramarathon')) raceType = 'Ultra Marathon';
      else if (name.includes('marathon')) raceType = 'Marathon';
      else if (name.includes('hyrox')) raceType = 'HYROX';
      else if (name.includes('ocr') || name.includes('tough mudder')) raceType = 'OCR';
      else if (name.includes('trail')) raceType = 'Trail';

      if (!raceTypeStats[raceType]) {
        raceTypeStats[raceType] = { success: 0, failure: 0, total: 0 };
      }
      raceTypeStats[raceType].total++;
      if (isSuccess) {
        raceTypeStats[raceType].success++;
      } else {
        raceTypeStats[raceType].failure++;
      }
    }

    console.log('### Overall Success Rate');
    console.log(`| Status | Count |`);
    console.log(`|--------|-------|`);
    console.log(`| Success | ${statusStats.success} |`);
    console.log(`| Failure | ${statusStats.failure} |`);
    console.log(`| **Rate** | **${((statusStats.success / (statusStats.success + statusStats.failure)) * 100).toFixed(1)}%** |\n`);

    console.log('### Failure Reasons\n');
    console.log(`| Error Type | Count |`);
    console.log(`|------------|-------|`);
    for (const [err, count] of Object.entries(errorTypeStats)
      .sort((a, b) => b[1] - a[1])) {
      console.log(`| ${err || 'unknown'} | ${count} |`);
    }

    console.log('\n### Success Rate by Race Type\n');
    console.log(`| Race Type | Success | Total | Rate |`);
    console.log(`|-----------|---------|-------|------|`);
    for (const [type, stats] of Object.entries(raceTypeStats)
      .sort((a, b) => b[1].total - a[1].total)) {
      const rate = ((stats.success / stats.total) * 100).toFixed(1);
      console.log(`| ${type} | ${stats.success} | ${stats.total} | ${rate}% |`);
    }

    // Sample successful and failed entries
    console.log('\n### Sample Success Cases (collected_at IS NOT NULL)\n');
    const successExamples = results.rows.filter(r => r.collected_at !== null).slice(0, 5);
    console.log(`| Event | Category | entry_fee | start_time |`);
    console.log(`|-------|----------|-----------|------------|`);
    for (const row of successExamples) {
      const ef = row.entry_fee ? '✓' : '—';
      const st = row.start_time ? '✓' : '—';
      console.log(`| ${row.event_name.substring(0, 20)} | ${row.category_name.substring(0, 15)} | ${ef} | ${st} |`);
    }

    console.log('\n### Sample Failure Cases (collected_at IS NULL)\n');
    const failureExamples = results.rows.filter(r => r.collected_at === null).slice(0, 5);
    console.log(`| Event | Category | attempt_count | Reason |`);
    console.log(`|-------|----------|---------------|--------|`);
    for (const row of failureExamples) {
      const reason = row.attempt_count >= 3 ? 'Max retries' : `Attempt ${row.attempt_count}`;
      console.log(`| ${row.event_name.substring(0, 20)} | ${row.category_name.substring(0, 15)} | ${row.attempt_count} | ${reason} |`);
    }

    await client.end();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

(async () => {
  await queryProcessingResults();
})();
