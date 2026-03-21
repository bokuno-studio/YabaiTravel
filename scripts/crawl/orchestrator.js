/**
 * ④ オーケストレータ
 * ②-A enrichEvent → ②-B enrichCategoryDetail × N → ③ enrichLogi の順で処理
 *
 * 使い方:
 *   node scripts/crawl/orchestrator.js              # 全件
 *   node scripts/crawl/orchestrator.js --dry-run    # DB更新なし
 *   node scripts/crawl/orchestrator.js --once       # 1バッチのみ
 *   node scripts/crawl/orchestrator.js --concurrency 10
 */
import pg from 'pg'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { enrichEvent } from './enrich-event.js'
import { InsufficientBalanceError } from './lib/enrich-utils.js'
import { enrichCategoryDetail } from './enrich-category-detail.js'
import { enrichLogi } from './enrich-logi.js'
import { translateEvent } from './enrich-translate.js'

const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  })
}

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const ONCE = args.includes('--once')
const EVENT_ONLY = args.includes('--event-only')    // ②-A + ③ のみ（②-B スキップ）
const CATEGORY_ONLY = args.includes('--category-only') // ②-B のみ（②-A スキップ）
const concurrencyIdx = args.indexOf('--concurrency')
const CONCURRENCY = concurrencyIdx >= 0 ? parseInt(args[concurrencyIdx + 1], 10) : 20

const SCHEMA = process.env.SUPABASE_SCHEMA ?? 'yabai_travel'

/** 配列を chunk サイズに分割 */
function chunkArray(arr, size) {
  const chunks = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

async function run() {
  console.log(`=== オーケストレータ開始 (DRY_RUN: ${DRY_RUN}, CONCURRENCY: ${CONCURRENCY}, ONCE: ${ONCE}) ===\n`)

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  // ②-A 未処理イベント
  const { rows: needsEventEnrich } = await client.query(
    `SELECT id, name, official_url, location, country, FALSE as event_done
     FROM ${SCHEMA}.events
     WHERE (
       collected_at IS NULL
       OR event_date IS NULL
       OR location IS NULL
       OR country IS NULL
       OR race_type IS NULL
     )
     AND (enrich_quality IS NULL OR enrich_quality != 'low')
     AND last_error_type IS DISTINCT FROM 'bug'
     AND (
       last_attempted_at IS NULL
       OR (last_error_type = 'not_available' AND last_attempted_at < NOW() - INTERVAL '3 days')
       OR (last_error_type = 'temporary'     AND last_attempted_at < NOW() - INTERVAL '0 days')
       OR (last_error_type IS NULL           AND last_attempted_at < NOW() - INTERVAL '1 day')
     )
     ORDER BY
       CASE WHEN collected_at IS NULL THEN 0 ELSE 1 END,
       updated_at ASC`
  )

  // ②-B のみ必要（②-A 完了だがカテゴリ詳細未収集）
  const { rows: needsCatDetail } = await client.query(
    `SELECT e.id, e.name, e.official_url, e.location, e.country, TRUE as event_done
     FROM ${SCHEMA}.events e
     WHERE e.collected_at IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM ${SCHEMA}.categories c
         WHERE c.event_id = e.id AND c.entry_fee IS NULL AND c.collected_at IS NULL
       )
     ORDER BY e.updated_at ASC`
  )

  await client.end()

  // マージ（モードに応じてフィルタ）
  const seenIds = new Set()
  const pendingEvents = []
  const sources = CATEGORY_ONLY
    ? needsCatDetail                           // ②-B のみ
    : EVENT_ONLY
      ? needsEventEnrich                       // ②-A のみ
      : [...needsEventEnrich, ...needsCatDetail] // 両方
  for (const ev of sources) {
    if (seenIds.has(ev.id)) continue
    seenIds.add(ev.id)
    pendingEvents.push(ev)
  }

  console.log(`処理対象: ${pendingEvents.length} 件（②-A未処理: ${needsEventEnrich.length}, ②-Bのみ: ${needsCatDetail.length}, モード: ${CATEGORY_ONLY ? 'category-only' : EVENT_ONLY ? 'event-only' : 'all'}）\n`)

  if (pendingEvents.length === 0) {
    console.log('処理対象なし。終了します。')
    return
  }

  const batches = chunkArray(pendingEvents, CONCURRENCY)
  let totalEventOk = 0
  let totalEventErr = 0
  let totalCatOk = 0
  let totalCatErr = 0
  let totalLogiOk = 0
  let totalLogiErr = 0

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx]
    const batchNum = batchIdx + 1

    console.log(`--- バッチ ${batchNum}/${batches.length} (${batch.length} 件) ---`)

    const batchResults = await Promise.allSettled(
      batch.map(async (event) => {
        // ②-A: イベント情報 + コース特定（--category-only 時はスキップ）
        let eventOk = !!event.event_done  // 既に ②-A 完了済みならスキップ
        let eventResultLocation = null
        if (!event.event_done && !CATEGORY_ONLY) {
          const eventResult = await enrichEvent(event, { dryRun: DRY_RUN }).catch(async (e) => {
            if (e instanceof InsufficientBalanceError) throw e
            // enrichEvent が throw した場合でも last_error_type を設定
            try {
              const errClient = new pg.Client({ connectionString: process.env.DATABASE_URL })
              await errClient.connect()
              const msg = e.message || ''
              let errorType = 'temporary'
              if (msg.includes('JSON') || msg.includes('parse') || e instanceof SyntaxError) errorType = 'parse_error'
              else if (msg.includes('timeout') || msg.includes('ETIMEDOUT')) errorType = 'timeout'
              else if (msg.includes('empty') || msg.includes('no JSON found')) errorType = 'empty_response'
              else if (msg.includes('ECONNREFUSED') || msg.includes('relation') || msg.includes('duplicate key')) errorType = 'db_error'
              await errClient.query(
                `UPDATE ${SCHEMA}.events SET last_error_type = $2 WHERE id = $1 AND last_error_type IS NULL`,
                [event.id, errorType]
              )
              await errClient.end()
            } catch { /* ignore */ }
            return { success: false, error: e.message }
          })
          if (eventResult.success) {
            totalEventOk++
            eventOk = true
            eventResultLocation = eventResult.location || null
            console.log(`  [event]  OK  ${event.name?.slice(0, 40)} | courses:${eventResult.categoriesCount ?? '?'}`)
          } else {
            totalEventErr++
            console.log(`  [event]  ERR ${event.name?.slice(0, 40)} | ${eventResult.error?.slice(0, 50)}`)
          }
        }

        // ②-B: 各カテゴリの詳細収集（--event-only 時はスキップ）
        if (eventOk && !EVENT_ONLY) {
          try {
            const catClient = new pg.Client({ connectionString: process.env.DATABASE_URL })
            await catClient.connect()
            const { rows: pendingCats } = await catClient.query(
              `SELECT id, name, distance_km FROM ${SCHEMA}.categories
               WHERE event_id = $1 AND entry_fee IS NULL AND collected_at IS NULL`,
              [event.id]
            )
            await catClient.end()

            for (const cat of pendingCats) {
              const catResult = await enrichCategoryDetail(
                { id: event.id, name: event.name, official_url: event.official_url },
                cat,
                { dryRun: DRY_RUN }
              ).catch((e) => {
                if (e instanceof InsufficientBalanceError) throw e
                return { success: false, error: e.message }
              })

              if (catResult.success) {
                totalCatOk++
                console.log(`  [cat]    OK  ${event.name?.slice(0, 25)} / ${cat.name?.slice(0, 20)}`)
              } else {
                totalCatErr++
                console.log(`  [cat]    ERR ${event.name?.slice(0, 25)} / ${cat.name?.slice(0, 20)} | ${catResult.error?.slice(0, 40)}`)
              }
            }
          } catch (e) {
            if (e instanceof InsufficientBalanceError) throw e
            console.log(`  [cat]    ERR ${event.name?.slice(0, 40)} | カテゴリ取得失敗: ${e.message?.slice(0, 40)}`)
          }
        }

        // ③: ロジ収集（--category-only 時はスキップ）
        if (CATEGORY_ONLY) return
        const enrichedEvent = eventResultLocation ? { ...event, location: eventResultLocation } : event
        const logiResult = await enrichLogi(enrichedEvent, { dryRun: DRY_RUN }).catch((e) => {
          if (e instanceof InsufficientBalanceError) throw e
          return { success: false, error: e.message }
        })
        if (logiResult.success) {
          totalLogiOk++
          console.log(`  [logi]   OK  ${event.name?.slice(0, 40)}`)
        } else {
          totalLogiErr++
          console.log(`  [logi]   ERR ${event.name?.slice(0, 40)} | ${logiResult.error?.slice(0, 50)}`)
        }

        // ⑤: 翻訳（name_en が未設定の場合のみ）
        const transResult = await translateEvent(event, { dryRun: DRY_RUN }).catch((e) => {
          if (e instanceof InsufficientBalanceError) throw e
          return { success: false, error: e.message }
        })
        if (transResult.success) {
          console.log(`  [trans]  OK  ${event.name?.slice(0, 40)}`)
        } else {
          console.log(`  [trans]  ERR ${event.name?.slice(0, 40)} | ${transResult.error?.slice(0, 50)}`)
        }
      })
    )

    // 残高不足チェック → 即時停止
    const balanceError = batchResults.find((r) => r.status === 'rejected' && r.reason instanceof InsufficientBalanceError)
    if (balanceError) {
      console.log('\n=== API 残高不足により処理を中断します ===')
      break
    }

    console.log()

    if (ONCE) {
      console.log('--once フラグにより1バッチで終了します。')
      break
    }

    // バッチ間ウェイト: Anthropic API レートリミット対策 (#69)
    if (batchIdx < batches.length - 1) {
      await new Promise((r) => setTimeout(r, 3000))
    }
  }

  // ⑤ 翻訳パス（メインループとは独立。enrich 済みで未翻訳のイベントを処理）
  if (!DRY_RUN) {
    const transClient = new pg.Client({ connectionString: process.env.DATABASE_URL })
    await transClient.connect()
    const { rows: untranslated } = await transClient.query(
      `SELECT id, name FROM ${SCHEMA}.events
       WHERE collected_at IS NOT NULL AND (
         (source_language IS DISTINCT FROM 'en' AND name_en IS NULL)
         OR (source_language = 'en' AND name = name_en)
       )
       ORDER BY collected_at DESC LIMIT 20`
    )
    await transClient.end()

    if (untranslated.length > 0) {
      console.log(`\n--- 翻訳パス (${untranslated.length} 件) ---`)
      for (const ev of untranslated) {
        try {
          const r = await translateEvent(ev, { dryRun: false })
          if (r.success) console.log(`  [trans]  OK  ${ev.name?.slice(0, 40)}`)
          else console.log(`  [trans]  ERR ${ev.name?.slice(0, 40)} | ${r.error?.slice(0, 50)}`)
        } catch (e) {
          if (e instanceof InsufficientBalanceError) {
            console.log('\n=== API 残高不足により翻訳を中断します ===')
            break
          }
          console.log(`  [trans]  ERR ${ev.name?.slice(0, 40)} | ${e.message?.slice(0, 50)}`)
        }
      }
    }
  }

  // コスト集計パス（参加費+交通費+宿泊費 → total_cost_estimate）
  if (!DRY_RUN) {
    const costClient = new pg.Client({ connectionString: process.env.DATABASE_URL })
    await costClient.connect()
    const { rowCount } = await costClient.query(`
      UPDATE ${SCHEMA}.events e SET total_cost_estimate = sub.total::text
      FROM (
        SELECT e2.id,
          GREATEST(
            COALESCE((SELECT MIN(ROUND(c.entry_fee * CASE c.entry_fee_currency
              WHEN 'USD' THEN 150 WHEN 'EUR' THEN 165 WHEN 'GBP' THEN 190
              WHEN 'CAD' THEN 110 WHEN 'AUD' THEN 100 WHEN 'NZD' THEN 90
              WHEN 'PHP' THEN 3 WHEN 'THB' THEN 4 WHEN 'SGD' THEN 112
              ELSE 1 END)) FROM ${SCHEMA}.categories c WHERE c.event_id = e2.id AND c.entry_fee IS NOT NULL), 0)
            + COALESCE((SELECT NULLIF(replace((regexp_match(ar.cost_estimate, '([0-9][0-9,]*)'))[1], ',', ''), '')::int FROM ${SCHEMA}.access_routes ar WHERE ar.event_id = e2.id AND ar.direction = 'outbound' AND ar.cost_estimate ~ '[0-9]' LIMIT 1), 0)
            + COALESCE((SELECT NULLIF(replace((regexp_match(ar2.cost_estimate, '([0-9][0-9,]*)'))[1], ',', ''), '')::int FROM ${SCHEMA}.access_routes ar2 WHERE ar2.event_id = e2.id AND ar2.direction = 'return' AND ar2.cost_estimate ~ '[0-9]' LIMIT 1), 0)
            + COALESCE((SELECT a.avg_cost_3star FROM ${SCHEMA}.accommodations a WHERE a.event_id = e2.id LIMIT 1), 0),
            COALESCE((SELECT MIN(ROUND(c.entry_fee * CASE c.entry_fee_currency
              WHEN 'USD' THEN 150 WHEN 'EUR' THEN 165 WHEN 'GBP' THEN 190
              WHEN 'CAD' THEN 110 WHEN 'AUD' THEN 100 WHEN 'NZD' THEN 90
              WHEN 'PHP' THEN 3 WHEN 'THB' THEN 4 WHEN 'SGD' THEN 112
              ELSE 1 END)) FROM ${SCHEMA}.categories c WHERE c.event_id = e2.id AND c.entry_fee IS NOT NULL), 0)
          ) AS total
        FROM ${SCHEMA}.events e2
        WHERE e2.collected_at IS NOT NULL
      ) sub
      WHERE e.id = sub.id AND sub.total > 0 AND (e.total_cost_estimate IS NULL OR e.total_cost_estimate != sub.total::text)
    `)
    await costClient.end()
    if (rowCount > 0) console.log(`\n[cost] ${rowCount} 件のトータルコストを集計`)
  }

  console.log('\n=== サマリー ===')
  console.log(`イベント情報:     OK ${totalEventOk} / ERR ${totalEventErr}`)
  console.log(`カテゴリ詳細:     OK ${totalCatOk} / ERR ${totalCatErr}`)
  console.log(`ロジエンリッチ:   OK ${totalLogiOk} / ERR ${totalLogiErr}`)

  // 失敗率が50%以上の場合、GitHub Issue を自動起票 (#74)
  const totalProcessed = totalEventOk + totalEventErr
  if (totalProcessed > 0 && totalEventErr / totalProcessed >= 0.5) {
    await createAlertIssue({
      totalProcessed,
      eventOk: totalEventOk,
      eventErr: totalEventErr,
      catOk: totalCatOk,
      catErr: totalCatErr,
      logiOk: totalLogiOk,
      logiErr: totalLogiErr,
    })
  }
}

/** GitHub Issue を起票してenrich失敗をアラートする */
async function createAlertIssue({ totalProcessed, eventOk, eventErr, catOk, catErr, logiOk, logiErr }) {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    console.log('[alert] GITHUB_TOKEN が未設定のため Issue 起票をスキップ')
    return
  }

  const repo = process.env.GITHUB_REPOSITORY || 'bokunon/YabaiTravel'
  const failRate = Math.round((eventErr / totalProcessed) * 100)
  const now = new Date().toISOString().slice(0, 10)

  // 同日の enrich-alert が既に open なら起票しない（重複防止）
  try {
    const searchRes = await fetch(`https://api.github.com/search/issues?q=repo:${repo}+label:enrich-alert+state:open+${now}+in:title`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (searchRes.ok) {
      const searchData = await searchRes.json()
      if (searchData.total_count > 0) {
        console.log(`[alert] 同日のアラート Issue が既に存在するためスキップ (${searchData.total_count}件)`)
        return
      }
    }
  } catch { /* 検索失敗時は起票を続行 */ }

  const title = `[自動検知] enrich失敗率 ${failRate}%（${now}）`
  const body = [
    '## enrich ジョブ失敗アラート',
    '',
    `| 項目 | 成功 | 失敗 |`,
    `|------|------|------|`,
    `| イベント情報（②-A） | ${eventOk} | ${eventErr} |`,
    `| カテゴリ詳細（②-B） | ${catOk} | ${catErr} |`,
    `| ロジエンリッチ（③） | ${logiOk} | ${logiErr} |`,
    '',
    `**失敗率: ${failRate}%**（閾値: 50%）`,
    '',
    `[Actions ログ](https://github.com/${repo}/actions)で詳細を確認してください。`,
    '',
    '_このIssueはオーケストレータにより自動起票されました。_',
  ].join('\n')

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title, body, labels: ['enrich-alert'] }),
    })
    if (res.ok) {
      const data = await res.json()
      console.log(`[alert] Issue 起票: ${data.html_url}`)
    } else {
      console.log(`[alert] Issue 起票失敗: ${res.status} ${await res.text()}`)
    }
  } catch (e) {
    console.log(`[alert] Issue 起票エラー: ${e.message}`)
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
