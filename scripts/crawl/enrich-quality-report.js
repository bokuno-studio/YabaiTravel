/**
 * enrich 品質レポート — Before/After 比較
 * 旧パイプライン（3/16以前）と新パイプライン（3/16以降）の充足率を比較表示
 *
 * 使い方:
 *   node scripts/crawl/enrich-quality-report.js
 */
import { queryManagementAPI } from '../supabase-api.js'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  })
}

const CUTOFF = '2026-03-16 04:00:00+00'

async function run() {
  // カテゴリレベルの充足率
  const catFields = ['distance_km', 'entry_fee', 'start_time', 'time_limit', 'elevation_gain', 'mandatory_gear', 'cutoff_times']
  const catSelectCounts = catFields.map((f) => `COUNT(${f}) as has_${f.replace(/_/g, '')}`).join(', ')

  const before = (await queryManagementAPI(`
    SELECT COUNT(*) as total, ${catSelectCounts}
    FROM yabai_travel.categories c
    JOIN yabai_travel.events e ON c.event_id = e.id
    WHERE e.collected_at < '${CUTOFF}'
  `))[0]

  const after = (await queryManagementAPI(`
    SELECT COUNT(*) as total, ${catSelectCounts}
    FROM yabai_travel.categories c
    JOIN yabai_travel.events e ON c.event_id = e.id
    WHERE e.collected_at >= '${CUTOFF}'
  `))[0]

  // ②-Bで更新されたカテゴリ（旧イベントだが新パイプラインで詳細が埋まったもの）
  const backfilled = (await queryManagementAPI(`
    SELECT COUNT(*) as total, ${catSelectCounts}
    FROM yabai_travel.categories c
    JOIN yabai_travel.events e ON c.event_id = e.id
    WHERE e.collected_at < '${CUTOFF}'
      AND c.updated_at >= '${CUTOFF}'
  `))[0]

  const pct = (n, t) => t > 0 ? Math.round(n / t * 100) + '%' : '-'
  const pad = (s, n) => String(s).padStart(n)

  console.log('╔══════════════════════════════════════════════════════════════════╗')
  console.log('║            enrich パイプライン 品質レポート                      ║')
  console.log('╠══════════════════════════════════════════════════════════════════╣')
  console.log('')
  console.log('■ カテゴリ詳細の充足率')
  console.log('')
  console.log(`  ${'項目'.padEnd(18)} ${'旧パイプライン'.padStart(14)} ${'新パイプライン'.padStart(14)} ${'②-B補完後'.padStart(14)}`)
  console.log(`  ${''.padEnd(18, '─')} ${''.padEnd(14, '─')} ${''.padEnd(14, '─')} ${''.padEnd(14, '─')}`)
  console.log(`  ${'対象カテゴリ数'.padEnd(16)} ${pad(before.total, 14)} ${pad(after.total, 14)} ${pad(backfilled.total, 14)}`)

  const fieldLabels = {
    distancekm: 'distance_km',
    entryfee: 'entry_fee',
    starttime: 'start_time',
    timelimit: 'time_limit',
    elevationgain: 'elevation_gain',
    mandatorygear: 'mandatory_gear',
    cutofftimes: 'cutoff_times',
  }

  for (const [key, label] of Object.entries(fieldLabels)) {
    const bVal = before[`has_${key}`] || 0
    const aVal = after[`has_${key}`] || 0
    const fVal = backfilled[`has_${key}`] || 0
    const bPct = pct(bVal, before.total)
    const aPct = pct(aVal, after.total)
    const fPct = pct(fVal, backfilled.total)
    const diff = after.total > 0 && before.total > 0
      ? (Math.round(aVal / after.total * 100) - Math.round(bVal / before.total * 100))
      : 0
    const diffStr = diff > 0 ? ` (+${diff}pp)` : diff < 0 ? ` (${diff}pp)` : ''
    console.log(`  ${label.padEnd(16)} ${pad(bPct, 14)} ${pad(aPct + diffStr, 14)} ${pad(fPct, 14)}`)
  }

  // イベントレベル
  const evFields = ['official_url', 'event_date', 'location', 'entry_start', 'weather_forecast']
  const evSelect = evFields.map((f) => `COUNT(${f}) as has_${f.replace(/_/g, '')}`).join(', ')

  const evBefore = (await queryManagementAPI(`
    SELECT COUNT(*) as total, ${evSelect}
    FROM yabai_travel.events WHERE collected_at < '${CUTOFF}'
  `))[0]

  const evAfter = (await queryManagementAPI(`
    SELECT COUNT(*) as total, ${evSelect}
    FROM yabai_travel.events WHERE collected_at >= '${CUTOFF}'
  `))[0]

  console.log('')
  console.log('■ イベント基本情報の充足率')
  console.log('')
  console.log(`  ${'項目'.padEnd(18)} ${'旧'.padStart(14)} ${'新'.padStart(14)}`)
  console.log(`  ${''.padEnd(18, '─')} ${''.padEnd(14, '─')} ${''.padEnd(14, '─')}`)
  console.log(`  ${'対象イベント数'.padEnd(16)} ${pad(evBefore.total, 14)} ${pad(evAfter.total, 14)}`)

  const evLabels = { officialurl: 'official_url', eventdate: 'event_date', location: 'location', entrystart: 'entry_start', weatherforecast: 'weather' }
  for (const [key, label] of Object.entries(evLabels)) {
    const bPct = pct(evBefore[`has_${key}`] || 0, evBefore.total)
    const aPct = pct(evAfter[`has_${key}`] || 0, evAfter.total)
    console.log(`  ${label.padEnd(16)} ${pad(bPct, 14)} ${pad(aPct, 14)}`)
  }

  console.log('')
  console.log('╚══════════════════════════════════════════════════════════════════╝')
}

run().catch((e) => { console.error(e); process.exit(1) })
