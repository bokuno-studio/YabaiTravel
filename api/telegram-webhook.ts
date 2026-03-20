import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true })

  const { message } = req.body || {}
  if (!message?.text) return res.status(200).json({ ok: true })

  const chatId = String(message.chat?.id)
  const allowedChatId = process.env.TELEGRAM_CHAT_ID
  if (chatId !== allowedChatId) return res.status(200).json({ ok: true })

  const text = message.text.trim().toLowerCase()

  if (text === 'レポート' || text === '/report') {
    try {
      await generateAndSendReport(chatId)
    } catch (err) {
      console.error('Report failed:', err)
      const botToken = process.env.TELEGRAM_BOT_TOKEN
      if (botToken) {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: `エラー: ${err instanceof Error ? err.message : String(err)}` }),
        }).catch(() => {})
      }
    }
  }

  return res.status(200).json({ ok: true })
}

function fmt(n: number): string { return n.toLocaleString() }
function pct(done: number, total: number): string {
  return total > 0 ? (done / total * 100).toFixed(1) + '%' : '0%'
}
function diff(current: number, prev: number | null | undefined): string {
  if (prev == null) return ''
  const d = current - prev
  return d > 0 ? ` (+${d})` : d < 0 ? ` (${d})` : ''
}

async function generateAndSendReport(chatId: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) return

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: 'yabai_travel' } }
  )

  const SCHEMA = 'yabai_travel'

  // Current stats
  const [
    { count: totalEvents },
    { count: totalCategories },
    { count: enrichedEvents },
    { count: enrichedCategories },
    { count: accessRoutes },
    { count: accommodations },
  ] = await Promise.all([
    supabase.from('events').select('id', { count: 'exact', head: true }),
    supabase.from('categories').select('id', { count: 'exact', head: true }),
    supabase.from('events').select('id', { count: 'exact', head: true }).not('collected_at', 'is', null),
    supabase.from('categories').select('id', { count: 'exact', head: true }).not('entry_fee', 'is', null),
    supabase.from('access_routes').select('event_id', { count: 'exact', head: true }),
    supabase.from('accommodations').select('event_id', { count: 'exact', head: true }),
  ])

  const te = totalEvents ?? 0
  const tc = totalCategories ?? 0
  const ee = enrichedEvents ?? 0
  const ec = enrichedCategories ?? 0
  const ar = Math.floor((accessRoutes ?? 0) / 2)
  const ac = accommodations ?? 0

  // Yesterday's snapshot from crawl_daily_stats
  const { data: history } = await supabase
    .from('crawl_daily_stats')
    .select('*')
    .order('stat_date', { ascending: false })
    .limit(7)

  const yesterday = history && history.length >= 2 ? history[1] : null

  // Error breakdown
  const { data: errorRows } = await supabase
    .from('events')
    .select('last_error_type')
    .is('collected_at', null)

  const errorCounts: Record<string, number> = {}
  errorRows?.forEach(e => {
    const t = e.last_error_type || '分類不明(null)'
    errorCounts[t] = (errorCounts[t] || 0) + 1
  })

  // Backlog estimates
  const eventBacklog = te - ee
  const catBacklog = tc - ec
  let eventEst = '不明'
  let catEst = '不明'
  if (history && history.length >= 2) {
    const first = history[0]
    const last = history[history.length - 1]
    const days = Math.max(1, history.length - 1)
    const eventRate = (last.enriched_events - first.enriched_events) / days
    const catRate = (last.enriched_categories - first.enriched_categories) / days
    eventEst = eventRate > 0 ? `約${Math.ceil(eventBacklog / eventRate)}日` : '停滞中'
    catEst = catRate > 0 ? `約${Math.ceil(catBacklog / catRate)}日` : '停滞中'
  }

  // Build report
  const today = new Date().toISOString().slice(0, 10)
  const lines: string[] = []
  lines.push(`📊 レポート (${today})`)
  lines.push('')
  lines.push('■ 全体サマリ')
  lines.push(`  レース数:    ${fmt(te)}${diff(te, yesterday?.total_events)}`)
  lines.push(`  カテゴリ数:  ${fmt(tc)}${diff(tc, yesterday?.total_categories)}`)
  lines.push('')
  lines.push('■ Enrich 進捗')
  lines.push(`  基本情報: ${fmt(ee)}/${fmt(te)} ${pct(ee, te)}`)
  lines.push(`  カテゴリ: ${fmt(ec)}/${fmt(tc)} ${pct(ec, tc)}`)
  lines.push(`  アクセス: ${fmt(ar)}/${fmt(ee)} ${pct(ar, ee)}`)
  lines.push(`  宿泊:     ${fmt(ac)}/${fmt(ee)} ${pct(ac, ee)}`)
  lines.push('')
  lines.push('■ 消化見込み')
  lines.push(`  基本: ${eventBacklog}件残 → ${eventEst}${diff(ee, yesterday?.enriched_events)}`)
  lines.push(`  カテゴリ: ${catBacklog}件残 → ${catEst}${diff(ec, yesterday?.enriched_categories)}`)
  lines.push('')
  lines.push('■ 空振り内訳')
  const errEntries = Object.entries(errorCounts).sort((a, b) => b[1] - a[1])
  if (errEntries.length === 0) {
    lines.push('  なし')
  } else {
    for (const [type, count] of errEntries) {
      lines.push(`  ${type}: ${count}件`)
    }
  }

  // Backlog trend (last 7 days)
  if (history && history.length >= 2) {
    lines.push('')
    lines.push('■ バックログ推移')
    const reversed = [...history].reverse()
    const maxVal = Math.max(...reversed.map(h => h.total_events - h.enriched_events), 1)
    for (const h of reversed) {
      const backlog = h.total_events - h.enriched_events
      const barLen = Math.round((backlog / maxVal) * 15)
      const bar = '█'.repeat(barLen)
      const dateStr = String(h.stat_date).slice(5, 10).replace('-', '/')
      lines.push(`  ${dateStr} ${bar} ${backlog}`)
    }
  }

  // Job status from GitHub Actions
  const repo = 'bokunon/YabaiTravel'
  const workflows = ['crawl-collect.yml', 'crawl-enrich.yml', 'crawl-daily-report.yml']
  lines.push('')
  lines.push('■ ジョブ実行状況')
  for (const wf of workflows) {
    try {
      const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${wf}/runs?per_page=1&status=completed`, {
        headers: { Accept: 'application/vnd.github+json' },
      })
      if (r.ok) {
        const data = await r.json()
        const run = data.workflow_runs?.[0]
        if (run) {
          const icon = run.conclusion === 'success' ? '✅' : run.conclusion === 'failure' ? '❌' : '⚠️'
          const date = new Date(run.updated_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
          lines.push(`  ${icon} ${wf.replace('.yml', '')} ${date}`)
        }
      }
    } catch { /* skip */ }
  }

  const report = '<pre>' + lines.join('\n').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>'

  // Send (split if > 4096 chars)
  const MAX = 4096
  if (report.length <= MAX) {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: report, parse_mode: 'HTML' }),
    })
  } else {
    // Send without parse_mode if too long
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: lines.join('\n') }),
    })
  }
}
