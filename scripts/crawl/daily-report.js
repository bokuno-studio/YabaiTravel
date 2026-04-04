/**
 * デイリークロール進捗レポート (#222, #224)
 *
 * - DB から現在の統計を取得し crawl_daily_stats にスナップショット保存
 * - 前日比・バックログ推移・エラー内訳を集計
 * - GitHub Actions の最新実行状況を取得
 * - Telegram + GitHub Issue コメントでレポート配信
 *
 * 使い方:
 *   node scripts/crawl/daily-report.js
 *   node scripts/crawl/daily-report.js --dry-run   # 送信せずコンソール出力のみ
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
const DRY_RUN = process.argv.includes('--dry-run')
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID
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
  return parseInt(rows[0].count, 10)
}

async function collectStats(client) {
  const [
    totalEvents,
    totalCategories,
    enrichedEvents,
    enrichedCategories,
    accessRoutes,
    accommodations,
    catWithEventDetail,
    catPending,
    catFailed,
    eventsWithDetailPage,
    logiDone,
    catDone,
    eventDateFilled,
    eventLatLngFilled,
    entryFeeFilled,
    accommodationEventsFilled,
    accessRouteCostFilled,
  ] = await Promise.all([
    queryCount(client, `SELECT count(*) FROM ${SCHEMA}.events`),
    queryCount(client, `SELECT count(*) FROM ${SCHEMA}.categories`),
    queryCount(client, `SELECT count(*) FROM ${SCHEMA}.events WHERE collected_at IS NOT NULL`),
    queryCount(client, `SELECT count(*) FROM ${SCHEMA}.categories WHERE entry_fee IS NOT NULL`),
    queryCount(client, `SELECT count(DISTINCT event_id) FROM ${SCHEMA}.access_routes`),
    queryCount(client, `SELECT count(DISTINCT event_id) FROM ${SCHEMA}.accommodations`),
    queryCount(client, `SELECT count(DISTINCT ec.event_id) FROM ${SCHEMA}.categories ec WHERE ec.collected_at IS NOT NULL`),
    queryCount(client, `SELECT count(*) FROM ${SCHEMA}.categories WHERE collected_at IS NULL AND attempt_count < 5`),
    queryCount(client, `SELECT count(*) FROM ${SCHEMA}.categories WHERE attempt_count >= 5`),
    queryCount(client, `SELECT count(*) FROM ${SCHEMA}.events WHERE official_url IS NOT NULL AND official_url != ''`),
    queryCount(client, `SELECT count(DISTINCT event_id) FROM ${SCHEMA}.access_routes`),
    queryCount(client, `SELECT count(*) FROM ${SCHEMA}.categories WHERE collected_at IS NOT NULL`),
    queryCount(client, `SELECT count(*) FROM ${SCHEMA}.events WHERE event_date IS NOT NULL`),
    queryCount(client, `SELECT count(*) FROM ${SCHEMA}.events WHERE latitude IS NOT NULL AND longitude IS NOT NULL`),
    queryCount(client, `SELECT count(*) FROM ${SCHEMA}.categories WHERE entry_fee IS NOT NULL`),
    queryCount(client, `SELECT count(DISTINCT event_id) FROM ${SCHEMA}.accommodations`),
    queryCount(client, `SELECT count(DISTINCT event_id) FROM ${SCHEMA}.access_routes WHERE cost_estimate IS NOT NULL`),
  ])

  // batch_jobs集計（直近24時間）
  let batchPendingJobs = 0, batchPendingRequests = 0, batchCompletedRequests = 0
  try {
    const batchRes = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') AS pending_jobs,
        COALESCE(SUM(request_count) FILTER (WHERE status = 'pending'), 0) AS pending_requests,
        COALESCE(SUM(succeeded) FILTER (WHERE status = 'ended'), 0) AS completed_requests
      FROM ${SCHEMA}.batch_jobs
      WHERE submitted_at >= NOW() - INTERVAL '24 hours'
    `)
    batchPendingJobs = parseInt(batchRes.rows[0].pending_jobs) || 0
    batchPendingRequests = parseInt(batchRes.rows[0].pending_requests) || 0
    batchCompletedRequests = parseInt(batchRes.rows[0].completed_requests) || 0
  } catch (e) {
    // batch_jobsテーブルが存在しない場合は無視
  }

  return {
    totalEvents,
    totalCategories,
    enrichedEvents,
    enrichedCategories,
    accessRoutes,
    accommodations,
    catWithEventDetail,
    catPending,
    catFailed,
    eventsWithDetailPage,
    logiDone,
    catDone,
    eventDateFilled,
    eventLatLngFilled,
    entryFeeFilled,
    accommodationEventsFilled,
    accessRouteCostFilled,
    batchPendingJobs,
    batchPendingRequests,
    batchCompletedRequests,
  }
}

async function upsertSnapshot(client, stats) {
  const today = new Date().toISOString().slice(0, 10)
  await client.query(`
    INSERT INTO ${SCHEMA}.crawl_daily_stats
      (stat_date, total_events, total_categories, enriched_events, enriched_categories, access_routes_count, accommodations_count)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (stat_date) DO UPDATE SET
      total_events = EXCLUDED.total_events,
      total_categories = EXCLUDED.total_categories,
      enriched_events = EXCLUDED.enriched_events,
      enriched_categories = EXCLUDED.enriched_categories,
      access_routes_count = EXCLUDED.access_routes_count,
      accommodations_count = EXCLUDED.accommodations_count
  `, [today, stats.totalEvents, stats.totalCategories, stats.enrichedEvents, stats.enrichedCategories, stats.accessRoutes, stats.accommodations])
}

async function getHistory(client, days = 7) {
  const { rows } = await client.query(`
    SELECT stat_date, total_events, total_categories, enriched_events, enriched_categories,
           access_routes_count, accommodations_count
    FROM ${SCHEMA}.crawl_daily_stats
    ORDER BY stat_date DESC
    LIMIT $1
  `, [days])
  return rows.reverse()
}

async function getErrorBreakdown(client) {
  const { rows } = await client.query(`
    SELECT last_error_type, count(*) as cnt
    FROM ${SCHEMA}.events
    WHERE collected_at IS NULL
    GROUP BY last_error_type
    ORDER BY cnt DESC
  `)
  return rows
}

// ---------------------------------------------------------------------------
// GitHub Actions status
// ---------------------------------------------------------------------------

async function getWorkflowRuns() {
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY) return null
  const workflows = ['crawl-collect.yml', 'crawl-enrich.yml']
  const results = []
  for (const wf of workflows) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/workflows/${wf}/runs?per_page=3&status=completed`,
        { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' } }
      )
      if (!res.ok) continue
      const data = await res.json()
      const runs = (data.workflow_runs || []).slice(0, 3).map((r) => ({
        name: wf.replace('.yml', ''),
        status: r.conclusion,
        date: r.updated_at ? new Date(r.updated_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '',
      }))
      results.push(...runs)
    } catch { /* ignore */ }
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
  if (previous == null) return ''
  const d = current - previous
  return d >= 0 ? ` (+${d})` : ` (${d})`
}

function pct(done, total) {
  if (total === 0) return '0.0%'
  return (done / total * 100).toFixed(1) + '%'
}

function statusIcon(pctStr, target) {
  const val = parseFloat(pctStr)
  if (val >= target) return '✅'
  if (val >= target * 0.9) return '⚠️'
  return '🔴'
}

function estimateDays(backlog, history, field) {
  if (backlog <= 0) return '完了'
  if (history.length < 2) {
    const current = history[0]?.[field] ?? 0
    if (current <= 0) return '不明'
    const rate = current / 7
    if (rate <= 0) return '不明'
    return `約${Math.ceil(backlog / rate)}`
  }
  const first = history[0]
  const last = history[history.length - 1]
  const days = Math.max(1, history.length - 1)
  const consumed = last[field] - first[field]
  const rate = consumed / days
  if (rate <= 0) return '停滞中'
  return `約${Math.ceil(backlog / rate)}`
}

function barGraph(history, valueKey, maxWidth = 20) {
  const values = history.map((h) => h[valueKey])
  const maxVal = Math.max(...values, 1)
  return history.map((h) => {
    const val = h[valueKey]
    const barLen = Math.round((val / maxVal) * maxWidth)
    const bar = '\u2588'.repeat(barLen)
    const dateStr = h.stat_date instanceof Date
      ? `${String(h.stat_date.getMonth() + 1).padStart(2, '0')}/${String(h.stat_date.getDate()).padStart(2, '0')}`
      : String(h.stat_date).slice(5, 10).replace('-', '/')
    return `  ${dateStr}  ${bar}  ${val}`
  }).join('\n')
}

function displayWidth(str) {
  let w = 0
  for (const ch of str) {
    const cp = ch.codePointAt(0)
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

function padEndW(str, width) {
  const w = displayWidth(str)
  return str + ' '.repeat(Math.max(0, width - w))
}

function buildReport(stats, yesterday, history, errors, workflowRuns) {
  const today = new Date().toISOString().slice(0, 10)

  const eventBacklog = stats.totalEvents - stats.enrichedEvents
  const catBacklog = stats.totalCategories - stats.enrichedCategories
  const accessBacklog = stats.enrichedEvents - stats.accessRoutes
  const accomBacklog = stats.enrichedEvents - stats.accommodations

  const lines = []
  lines.push(`📊 クロール進捗レポート（${today}）`)
  lines.push('')

  // --- Pipeline Status ---
  lines.push('■ パイプライン状況')
  lines.push('')
  lines.push('[イベント収集]')
  lines.push(`  取得イベント総数: ${fmt(stats.totalEvents)}件`)
  lines.push(`    詳細ページあり: ${fmt(stats.eventsWithDetailPage)}件 (${pct(stats.eventsWithDetailPage, stats.totalEvents)})`)
  lines.push('')
  lines.push('[カテゴリ取得]')
  lines.push(`  取得済み: ${fmt(stats.catDone)}件 / ${fmt(stats.totalCategories)}件`)
  lines.push(`  未取得  : ${fmt(stats.catPending)}件`)
  lines.push('')
  lines.push('[レース詳細（AI処理）]')
  lines.push(`  完了: ${fmt(stats.catDone)}件 (${pct(stats.catDone, stats.totalCategories)})`)
  lines.push(`  未処理: ${fmt(catBacklog)}件`)
  lines.push('')
  lines.push('[ロジ情報（AI処理）]')
  lines.push(`  完了: ${fmt(stats.logiDone)}件 (${pct(stats.logiDone, stats.totalEvents)})`)
  lines.push(`  未処理: ${fmt(accessBacklog)}件`)
  lines.push('')
  lines.push('[AI Batch処理（直近24h）]')
  lines.push(`  投入済み（処理中）: ${fmt(stats.batchPendingJobs)}件 (${fmt(stats.batchPendingRequests)} リクエスト)`)
  lines.push(`  完了（取得済み）  : ${fmt(stats.batchCompletedRequests)}件`)
  lines.push('')

  // --- Summary ---
  lines.push('■ 全体サマリー')
  lines.push(`  レース数:        ${fmt(stats.totalEvents)}${diff(stats.totalEvents, yesterday?.total_events)}`)
  lines.push(`  カテゴリ数:     ${fmt(stats.totalCategories)}${diff(stats.totalCategories, yesterday?.total_categories)}`)
  lines.push('')

  // --- Enrich progress ---
  lines.push('■ Enrich進捗')
  lines.push(`  ${padEndW('', 14)} ${'完了'.padStart(5)}  ${'未完了'.padStart(5)}  ${'完了率'.padStart(6)}  ${'前日比'.padStart(5)}`)

  const enrichRows = [
    { label: 'イベント基本情報', done: stats.enrichedEvents, total: stats.totalEvents, prevDone: yesterday?.enriched_events },
    { label: 'カテゴリ詳細', done: stats.enrichedCategories, total: stats.totalCategories, prevDone: yesterday?.enriched_categories },
    { label: 'アクセス情報', done: stats.accessRoutes, total: stats.enrichedEvents, prevDone: yesterday?.access_routes_count },
    { label: '宿泊情報', done: stats.accommodations, total: stats.enrichedEvents, prevDone: yesterday?.accommodations_count },
  ]
  for (const r of enrichRows) {
    const remaining = r.total - r.done
    const dayDiff = r.prevDone != null ? diff(r.done, r.prevDone) : ''
    lines.push(`  ${padEndW(r.label, 14)} ${fmt(r.done).padStart(5)}  ${fmt(remaining).padStart(5)}  ${pct(r.done, r.total).padStart(6)}  ${dayDiff.padStart(5)}`)
  }
  lines.push('')

  // --- Backlog estimate ---
  lines.push('■ バックログ消化見込み')
  const eventEst = estimateDays(eventBacklog, history, 'enriched_events')
  const catEst = estimateDays(catBacklog, history, 'enriched_categories')
  lines.push(`  イベント基本: ${eventBacklog}件残 → ${eventEst}日後に完了`)
  lines.push(`  カテゴリ詳細: ${catBacklog}件残 → ${catEst}日後に完了`)
  lines.push('')

  // --- Error breakdown ---
  lines.push('■ Enrich空振り内訳')
  if (errors.length === 0) {
    lines.push('  なし')
  } else {
    for (const e of errors) {
      const label = e.last_error_type ?? '分類不明(null)'
      lines.push(`  ${padEndW(label, 14)} ${e.cnt}件`)
    }
  }
  lines.push('')

  // --- Backlog trend graph ---
  if (history.length >= 2) {
    lines.push('■ バックログ推移（直近7日 - イベント未処理数）')
    const backlogHistory = history.map((h) => ({
      ...h,
      _backlog: h.total_events - h.enriched_events,
    }))
    lines.push(barGraph(backlogHistory, '_backlog'))
    lines.push('')
  }

  // --- Workflow runs ---
  if (workflowRuns) {
    lines.push('■ ジョブ実行状況')
    for (const r of workflowRuns) {
      const icon = r.status === 'success' ? '✅' : r.status === 'failure' ? '❌' : '⚠️'
      lines.push(`  ${icon} ${r.name}  ${r.status}  ${r.date}`)
    }
    lines.push('')
  }

  // --- Data Quality Metrics ---
  lines.push('■ 10指標充填率（目標達成状況）')
  const detailPagePct = pct(stats.eventsWithDetailPage, stats.totalEvents)
  const detailFillPct = pct(stats.enrichedEvents, stats.totalEvents)
  const logiPct = pct(stats.logiDone, stats.totalEvents)
  const entryFeePct = pct(stats.entryFeeFilled, stats.totalCategories)
  const accomPct = pct(stats.accommodationEventsFilled, stats.totalEvents)
  const datePct = pct(stats.eventDateFilled, stats.totalEvents)
  const latlngPct = pct(stats.eventLatLngFilled, stats.totalEvents)
  const moveCostPct = pct(stats.accessRouteCostFilled, stats.totalEvents)
  const accessPct = pct(stats.logiDone, stats.totalEvents)

  lines.push(`  詳細ページあり  ${detailPagePct.padStart(5)} [目標 90%] ${statusIcon(detailPagePct, 90)}`)
  lines.push(`  詳細充填        ${detailFillPct.padStart(5)} [目標 95%] ${statusIcon(detailFillPct, 95)}`)
  lines.push(`  ロジ充填        ${logiPct.padStart(5)} [目標 95%] ${statusIcon(logiPct, 95)}`)
  lines.push(`  レース料金      ${entryFeePct.padStart(5)} [目標 70%] ${statusIcon(entryFeePct, 70)}`)
  lines.push(`  宿泊料金        ${accomPct.padStart(5)} [目標 60%] ${statusIcon(accomPct, 60)}`)
  lines.push(`  日程            ${datePct.padStart(5)} [目標 95%] ${statusIcon(datePct, 95)}`)
  lines.push(`  場所(lat/lng)   ${latlngPct.padStart(5)} [目標 95%] ${statusIcon(latlngPct, 95)}`)
  lines.push(`  移動料金        ${moveCostPct.padStart(5)} [目標 60%] ${statusIcon(moveCostPct, 60)}`)
  lines.push(`  東京アクセス    ${accessPct.padStart(5)} [目標 95%] ${statusIcon(accessPct, 95)}`)
  lines.push('')

  return '<pre>' + lines.join('\n').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>'
}

// ---------------------------------------------------------------------------
// Delivery: Telegram
// ---------------------------------------------------------------------------

const TELEGRAM_MAX_LENGTH = 4096

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('[Telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set, skipping')
    return
  }

  const chunks = []
  if (text.length <= TELEGRAM_MAX_LENGTH) {
    chunks.push(text)
  } else {
    const lines = text.split('\n')
    let current = ''
    for (const line of lines) {
      if (current.length + line.length + 1 > TELEGRAM_MAX_LENGTH) {
        chunks.push(current)
        current = line
      } else {
        current += (current ? '\n' : '') + line
      }
    }
    if (current) chunks.push(current)
  }

  for (const chunk of chunks) {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: chunk,
        parse_mode: 'HTML',
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      console.error(`[Telegram] Failed to send: ${res.status} ${body}`)
      const retry = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: chunk,
        }),
      })
      if (!retry.ok) {
        console.error(`[Telegram] Retry also failed: ${retry.status}`)
      }
    }
  }
  console.log(`[Telegram] Report sent (${chunks.length} message(s))`)
}

// ---------------------------------------------------------------------------
// Delivery: GitHub Issue comment
// ---------------------------------------------------------------------------

const REPORT_ISSUE_TITLE = '📊 Daily Crawl Report'
const REPORT_ISSUE_LABEL = 'daily-report'

async function findOrCreateReportIssue() {
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY) {
    console.log('[GitHub] GITHUB_TOKEN or GITHUB_REPOSITORY not set, skipping')
    return null
  }

  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
  }

  const searchRes = await fetch(
    `https://api.github.com/repos/${GITHUB_REPOSITORY}/issues?labels=${REPORT_ISSUE_LABEL}&state=open&per_page=1`,
    { headers }
  )
  if (searchRes.ok) {
    const issues = await searchRes.json()
    if (issues.length > 0) {
      return issues[0].number
    }
  }

  try {
    await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/labels`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: REPORT_ISSUE_LABEL, color: '0075ca', description: 'Daily crawl report thread' }),
    })
  } catch { /* label may already exist */ }

  const createRes = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/issues`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: REPORT_ISSUE_TITLE,
      body: 'This issue collects daily crawl progress reports.\nNew reports are posted as comments automatically.',
      labels: [REPORT_ISSUE_LABEL],
    }),
  })
  if (!createRes.ok) {
    console.error(`[GitHub] Failed to create issue: ${createRes.status}`)
    return null
  }
  const issue = await createRes.json()
  console.log(`[GitHub] Created report issue #${issue.number}`)
  return issue.number
}

async function postGitHubComment(issueNumber, text) {
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY || !issueNumber) return

  const body = '```\n' + text + '\n```'

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPOSITORY}/issues/${issueNumber}/comments`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body }),
    }
  )
  if (!res.ok) {
    console.error(`[GitHub] Failed to post comment: ${res.status}`)
  } else {
    console.log(`[GitHub] Comment posted on issue #${issueNumber}`)
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  try {
    await ensureStatsTable(client)
    const stats = await collectStats(client)
    console.log('Current stats:', stats)
    await upsertSnapshot(client, stats)
    const history = await getHistory(client, 7)
    const yesterday = history.length >= 2 ? history[history.length - 2] : null
    const errors = await getErrorBreakdown(client)
    const workflowRuns = await getWorkflowRuns()
    const report = buildReport(stats, yesterday, history, errors, workflowRuns)
    console.log('\n' + report)

    if (DRY_RUN) {
      console.log('\n[dry-run] Skipping delivery')
      return
    }

    await sendTelegram(report)
    const issueNumber = await findOrCreateReportIssue()
    await postGitHubComment(issueNumber, report)

  } finally {
    await client.end()
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
