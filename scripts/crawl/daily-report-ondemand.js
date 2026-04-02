/**
 * オンデマンド: デイリークロール進捗レポート
 *
 * - DB から現在の統計を取得
 * - 前日比を crawl_daily_stats から計算
 * - パイプライン段階別の処理状況を集計
 * - GitHub Actions の最新実行状況を取得
 * - ターミナルに出力（Telegram・GitHub送信なし）
 *
 * 使い方:
 *   npm run report:daily
 *   node scripts/crawl/daily-report-ondemand.js
 */
import pg from 'pg'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

// .env.local 読み込み（ローカル実行用）
const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  })
}

const SCHEMA = process.env.SUPABASE_SCHEMA ?? 'yabai_travel'
const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function ensureStatsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.crawl_daily_stats (
      id SERIAL PRIMARY KEY,
      stat_date DATE NOT NULL UNIQUE,
      total_events INT NOT NULL DEFAULT 0,
      total_categories INT NOT NULL DEFAULT 0,
      enriched_events INT NOT NULL DEFAULT 0,
      enriched_categories INT NOT NULL DEFAULT 0,
      access_routes_count INT NOT NULL DEFAULT 0,
      accommodations_count INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

async function queryCount(client, sql) {
  const { rows } = await client.query(sql)
  return rows[0] ? parseInt(rows[0].count, 10) : 0
}

async function collectStats(client) {
  // Sequential queries to avoid "client executing a query" deprecation warning
  const totalEvents = await queryCount(client, `SELECT count(*) FROM ${SCHEMA}.events`)
  const totalCategories = await queryCount(client, `SELECT count(*) FROM ${SCHEMA}.categories`)
  const enrichedEvents = await queryCount(client, `SELECT count(*) FROM ${SCHEMA}.events WHERE collected_at IS NOT NULL`)
  const enrichedCategories = await queryCount(client, `SELECT count(*) FROM ${SCHEMA}.categories WHERE entry_fee IS NOT NULL`)
  const accessRoutes = await queryCount(client, `SELECT count(DISTINCT event_id) FROM ${SCHEMA}.access_routes`)
  const accommodations = await queryCount(client, `SELECT count(DISTINCT event_id) FROM ${SCHEMA}.accommodations`)

  return { totalEvents, totalCategories, enrichedEvents, enrichedCategories, accessRoutes, accommodations }
}

async function getYesterdaySnapshot(client) {
  const today = new Date().toISOString().slice(0, 10)
  const { rows } = await client.query(`
    SELECT stat_date, total_events, total_categories, enriched_events, enriched_categories,
           access_routes_count, accommodations_count
    FROM ${SCHEMA}.crawl_daily_stats
    WHERE stat_date = CURRENT_DATE - INTERVAL '1 day'
    LIMIT 1
  `)
  return rows.length > 0 ? rows[0] : null
}

async function getPipelineStats(client) {
  const { rows } = await client.query(`
    SELECT
      SUM(CASE WHEN official_url IS NULL THEN 1 ELSE 0 END) as waiting,
      SUM(CASE WHEN official_url IS NOT NULL AND collected_at IS NULL THEN 1 ELSE 0 END) as processing,
      SUM(CASE WHEN collected_at IS NOT NULL THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN attempt_count > 5 AND collected_at IS NULL THEN 1 ELSE 0 END) as errored
    FROM ${SCHEMA}.events
  `)
  return rows[0] || {}
}

async function getErrorBreakdown(client) {
  const { rows } = await client.query(`
    SELECT last_error_type, count(*) as cnt
    FROM ${SCHEMA}.events
    WHERE attempt_count > 5 AND collected_at IS NULL
    GROUP BY last_error_type
    ORDER BY cnt DESC
  `)
  return rows
}

// ---------------------------------------------------------------------------
// GitHub Actions status
// ---------------------------------------------------------------------------

async function getWorkflowRuns() {
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY) {
    console.log('[⚠️  GitHub Actions] GITHUB_TOKEN or GITHUB_REPOSITORY not set')
    return null
  }

  const workflows = ['crawl-collect.yml', 'crawl-enrich-events.yml', 'crawl-enrich-categories.yml']
  const results = []

  for (const wf of workflows) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/workflows/${wf}/runs?per_page=1&status=completed`,
        { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' } }
      )
      if (!res.ok) {
        results.push({
          name: wf.replace('.yml', ''),
          status: 'error',
          date: '(API error)',
        })
        continue
      }
      const data = await res.json()
      const run = (data.workflow_runs || [])[0]
      if (run) {
        const icon = run.conclusion === 'success' ? '✅' : run.conclusion === 'failure' ? '❌' : '⚠️'
        results.push({
          name: wf.replace('.yml', ''),
          status: run.conclusion,
          date: new Date(run.updated_at).toLocaleString('ja-JP', {
            timeZone: 'Asia/Tokyo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          }),
          icon,
        })
      } else {
        results.push({
          name: wf.replace('.yml', ''),
          status: 'no_runs',
          date: '(no runs)',
          icon: '❓',
        })
      }
    } catch (e) {
      results.push({
        name: wf.replace('.yml', ''),
        status: 'error',
        date: `(error: ${e.message})`,
        icon: '⚠️',
      })
    }
  }

  return results.length > 0 ? results : null
}

// ---------------------------------------------------------------------------
// Report formatting
// ---------------------------------------------------------------------------

function fmt(n) {
  return n.toLocaleString('ja-JP')
}

function diff(current, previous) {
  if (previous == null) return 'N/A'
  const d = current - previous
  return d > 0 ? `+${fmt(d)}` : d < 0 ? fmt(d) : '±0'
}

function displayWidth(str) {
  let w = 0
  for (const ch of str) {
    const cp = ch.codePointAt(0)
    // CJK, fullwidth, etc.
    w += (cp >= 0x1100 && (
      (cp <= 0x115f) || cp === 0x2329 || cp === 0x232a ||
      (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe10 && cp <= 0xfe6f) ||
      (cp >= 0xff01 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x20000 && cp <= 0x2fffd) ||
      (cp >= 0x30000 && cp <= 0x3fffd)
    )) ? 2 : 1
  }
  return w
}

function padEnd(str, width) {
  const w = displayWidth(str)
  return str + ' '.repeat(Math.max(0, width - w))
}

function padStart(str, width) {
  const w = displayWidth(str)
  return ' '.repeat(Math.max(0, width - w)) + str
}

function buildReport(stats, yesterday, pipeline, errors, workflowRuns) {
  const today = new Date().toISOString().slice(0, 10)
  const lines = []

  lines.push('')
  lines.push('════════════════════════════════════════════════════════════════')
  lines.push('📊 デイリークロール進捗レポート')
  lines.push(`   ${today}`)
  lines.push('════════════════════════════════════════════════════════════════')
  lines.push('')

  // --- Section 1: Event and Category totals ---
  lines.push('【1️⃣  全体サマリー】')
  lines.push('')
  lines.push(`  イベント総件数:   ${padStart(fmt(stats.totalEvents), 6)} 件  前日比: ${padStart(diff(stats.totalEvents, yesterday?.total_events), 7)}`)
  lines.push(`  カテゴリ総件数:   ${padStart(fmt(stats.totalCategories), 6)} 件  前日比: ${padStart(diff(stats.totalCategories, yesterday?.total_categories), 7)}`)
  lines.push('')

  // --- Section 2: Pipeline progress ---
  lines.push('【2️⃣  エンリッチ処理ステータス】')
  lines.push('')

  const waiting = parseInt(pipeline.waiting || 0, 10)
  const processing = parseInt(pipeline.processing || 0, 10)
  const completed = parseInt(pipeline.completed || 0, 10)
  const errored = parseInt(pipeline.errored || 0, 10)

  lines.push('  | フェーズ        | 件数     | パーセント |')
  lines.push('  |─────────────────┼──────────┼────────────|')
  lines.push(`  | ${padEnd('収集待ち', 13)} | ${padStart(fmt(waiting), 6)} | ${padStart(((waiting / (waiting + processing + completed + errored)) * 100).toFixed(1) + '%', 8)} |`)
  lines.push(`  | ${padEnd('処理中', 13)} | ${padStart(fmt(processing), 6)} | ${padStart(((processing / (waiting + processing + completed + errored)) * 100).toFixed(1) + '%', 8)} |`)
  lines.push(`  | ${padEnd('完了', 13)} | ${padStart(fmt(completed), 6)} | ${padStart(((completed / (waiting + processing + completed + errored)) * 100).toFixed(1) + '%', 8)} |`)
  lines.push(`  | ${padEnd('エラー', 13)} | ${padStart(fmt(errored), 6)} | ${padStart(((errored / (waiting + processing + completed + errored)) * 100).toFixed(1) + '%', 8)} |`)
  lines.push('')

  // --- Section 3: Error breakdown ---
  lines.push('【3️⃣  エラー内訳 (attempt_count > 5)】')
  lines.push('')
  if (errored === 0) {
    lines.push('  ✅ エラー件数: 0件')
  } else if (errors.length === 0) {
    lines.push(`  ⚠️  エラー件数: ${errored}件 (詳細分類なし)`)
  } else {
    lines.push(`  ⚠️  エラー件数: ${errored}件`)
    lines.push('')
    for (const e of errors) {
      const label = e.last_error_type ?? '(分類不明)'
      lines.push(`     - ${label}: ${e.cnt}件`)
    }
  }
  lines.push('')

  // --- Section 4: Cron status ---
  lines.push('【4️⃣  Cron稼働状況 (GitHub Actions)】')
  lines.push('')
  if (!workflowRuns) {
    lines.push('  ❌ GitHub Actions APIに接続できません')
  } else {
    for (const r of workflowRuns) {
      const icon = r.icon || '❓'
      const statusStr = r.status === 'success' ? '成功' : r.status === 'failure' ? '失敗' : r.status === 'no_runs' ? '実行なし' : 'エラー'
      lines.push(`  ${icon} ${padEnd(r.name, 25)} ${statusStr.padStart(6)}  ${r.date}`)
    }
  }
  lines.push('')

  lines.push('════════════════════════════════════════════════════════════════')
  lines.push('')

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  try {
    // Ensure stats table exists
    await ensureStatsTable(client)

    // Collect current stats
    const stats = await collectStats(client)

    // Get yesterday's snapshot
    const yesterday = await getYesterdaySnapshot(client)

    // Get pipeline stats
    const pipeline = await getPipelineStats(client)

    // Get error breakdown
    const errors = await getErrorBreakdown(client)

    // Get GitHub Actions status
    const workflowRuns = await getWorkflowRuns()

    // Build and output report
    const report = buildReport(stats, yesterday, pipeline, errors, workflowRuns)
    console.log(report)

  } finally {
    await client.end()
  }
}

run().catch((e) => {
  console.error('❌ Error:', e)
  process.exit(1)
})
