#!/usr/bin/env node
/**
 * 日次メトリクス取得スクリプト
 * オーナーが毎日見たい数字を出力
 */
import pg from 'pg'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

// .env.local 読み込み
const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  })
}

const SCHEMA = process.env.SUPABASE_SCHEMA ?? 'yabai_travel'

async function getMetrics() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  try {
    console.log('\n📊 日次メトリクス取得（2026-04-01）\n')

    // 1. イベント総件数
    const events = await client.query(`SELECT COUNT(*) as count FROM ${SCHEMA}.events WHERE deleted_at IS NULL`)
    const totalEvents = parseInt(events.rows[0].count, 10)

    // 前日比（昨日の統計）
    const prevDayEvents = await client.query(`
      SELECT total_events FROM ${SCHEMA}.crawl_daily_stats
      WHERE stat_date = CURRENT_DATE - 1
    `)
    const prevEvents = prevDayEvents.rows[0]?.total_events ?? 0
    const eventsDiff = totalEvents - prevEvents

    console.log(`1. イベント総件数`)
    console.log(`   現在: ${totalEvents} 件`)
    console.log(`   前日比: ${eventsDiff > 0 ? '+' : ''}${eventsDiff} 件\n`)

    // 2. カテゴリ総件数
    const categories = await client.query(`SELECT COUNT(*) as count FROM ${SCHEMA}.categories WHERE deleted_at IS NULL`)
    const totalCategories = parseInt(categories.rows[0].count, 10)

    const prevDayCategories = await client.query(`
      SELECT total_categories FROM ${SCHEMA}.crawl_daily_stats
      WHERE stat_date = CURRENT_DATE - 1
    `)
    const prevCategories = prevDayCategories.rows[0]?.total_categories ?? 0
    const categoriesDiff = totalCategories - prevCategories

    console.log(`2. カテゴリ総件数`)
    console.log(`   現在: ${totalCategories} 件`)
    console.log(`   前日比: ${categoriesDiff > 0 ? '+' : ''}${categoriesDiff} 件\n`)

    // 3. エンリッチ処理状況
    console.log(`3. エンリッチ処理状況\n`)

    // 3-1. enrich-event（collected_at）
    const enrichedEvents = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN collected_at IS NOT NULL THEN 1 END) as enriched,
        COUNT(CASE WHEN collected_at IS NULL AND enrich_attempt_count >= 5 THEN 1 END) as failed,
        COUNT(CASE WHEN collected_at IS NULL AND enrich_attempt_count < 5 THEN 1 END) as pending
      FROM ${SCHEMA}.events
      WHERE deleted_at IS NULL
    `)
    const eventStats = enrichedEvents.rows[0]
    console.log(`   enrich-event:`)
    console.log(`     ✅ エンリッチ済み: ${eventStats.enriched} / ${eventStats.total} 件 (${Math.round(eventStats.enriched / eventStats.total * 100)}%)`)
    console.log(`     ⏳ 処理待ち: ${eventStats.pending} 件`)
    console.log(`     ❌ エラー: ${eventStats.failed} 件 (attempt_count >= 5)\n`)

    // 3-2. enrich-category-detail
    const enrichedCategories = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN entry_fee IS NOT NULL THEN 1 END) as enriched,
        COUNT(CASE WHEN entry_fee IS NULL AND attempt_count >= 5 THEN 1 END) as failed,
        COUNT(CASE WHEN entry_fee IS NULL AND attempt_count < 5 THEN 1 END) as pending
      FROM ${SCHEMA}.categories
      WHERE deleted_at IS NULL
    `)
    const catStats = enrichedCategories.rows[0]
    console.log(`   enrich-category-detail:`)
    console.log(`     ✅ エンリッチ済み: ${catStats.enriched} / ${catStats.total} 件 (${Math.round(catStats.enriched / catStats.total * 100)}%)`)
    console.log(`     ⏳ 処理待ち: ${catStats.pending} 件`)
    console.log(`     ❌ エラー: ${catStats.failed} 件 (attempt_count >= 5)\n`)

    // 3-3. その他enrichステップ
    const logi = await client.query(`
      SELECT
        COUNT(DISTINCT event_id) as total
      FROM ${SCHEMA}.access_routes
    `)
    console.log(`   enrich-logi（交通情報）:`)
    console.log(`     ✅ 完了: ${logi.rows[0]?.total ?? 0} 件\n`)

    const accommodations = await client.query(`
      SELECT
        COUNT(DISTINCT event_id) as total
      FROM ${SCHEMA}.accommodations
    `)
    console.log(`   enrich-accommodations（宿泊情報）:`)
    console.log(`     ✅ 完了: ${accommodations.rows[0]?.total ?? 0} 件\n`)

    // 4. クロール状況（新規URL収集件数）
    console.log(`4. クロール状況\n`)

    // イベント側から推定
    const today = new Date().toISOString().slice(0, 10)
    const todayEvents = await client.query(`
      SELECT COUNT(*) as count
      FROM ${SCHEMA}.events
      WHERE updated_at::DATE = $1 AND deleted_at IS NULL
    `, [today])

    console.log(`   新規/更新:`)
    console.log(`     📅 本日更新: ${todayEvents.rows[0]?.count ?? 0} 件\n`)

    // サマリー
    console.log(`─────────────────────────────────────`)
    console.log(`📈 全体進捗:\n`)
    const totalBacklogEvents = parseInt(eventStats.pending, 10)
    const totalBacklogCategories = parseInt(catStats.pending, 10)
    const totalBacklog = totalBacklogEvents + totalBacklogCategories
    const totalErrors = parseInt(eventStats.failed, 10) + parseInt(catStats.failed, 10)
    console.log(`   🎯 処理待ちバックログ: ${totalBacklog} 件 (イベント: ${totalBacklogEvents}, カテゴリ: ${totalBacklogCategories})`)
    console.log(`   ⚠️  エラー総数: ${totalErrors} 件`)
    console.log(`   ✅ 新規追加: ${eventsDiff + categoriesDiff} 件\n`)

  } finally {
    await client.end()
  }
}

getMetrics().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
