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
const concurrencyIdx = args.indexOf('--concurrency')
const CONCURRENCY = concurrencyIdx >= 0 ? parseInt(args[concurrencyIdx + 1], 10) : 5

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
     AND (last_attempted_at IS NULL OR last_attempted_at < NOW() - INTERVAL '7 days')
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

  // マージ（②-A 未処理が優先、②-B のみは後ろに追加。ID重複除去）
  const seenIds = new Set()
  const pendingEvents = []
  for (const ev of [...needsEventEnrich, ...needsCatDetail]) {
    if (seenIds.has(ev.id)) continue
    seenIds.add(ev.id)
    pendingEvents.push(ev)
  }

  console.log(`処理対象: ${pendingEvents.length} 件（②-A未処理: ${needsEventEnrich.length}, ②-Bのみ: ${needsCatDetail.length}）\n`)

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

    await Promise.allSettled(
      batch.map(async (event) => {
        // ②-A: イベント情報 + コース特定（未処理の場合のみ）
        let eventOk = !!event.event_done  // 既に ②-A 完了済みならスキップ
        if (!event.event_done) {
          const eventResult = await enrichEvent(event, { dryRun: DRY_RUN }).catch((e) => ({ success: false, error: e.message }))
          if (eventResult.success) {
            totalEventOk++
            eventOk = true
            console.log(`  [event]  OK  ${event.name?.slice(0, 40)} | courses:${eventResult.categoriesCount ?? '?'}`)
          } else {
            totalEventErr++
            console.log(`  [event]  ERR ${event.name?.slice(0, 40)} | ${eventResult.error?.slice(0, 50)}`)
          }
        }

        // ②-B: 各カテゴリの詳細収集
        if (eventOk) {
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
              ).catch((e) => ({ success: false, error: e.message }))

              if (catResult.success) {
                totalCatOk++
                console.log(`  [cat]    OK  ${event.name?.slice(0, 25)} / ${cat.name?.slice(0, 20)}`)
              } else {
                totalCatErr++
                console.log(`  [cat]    ERR ${event.name?.slice(0, 25)} / ${cat.name?.slice(0, 20)} | ${catResult.error?.slice(0, 40)}`)
              }
            }
          } catch (e) {
            console.log(`  [cat]    ERR ${event.name?.slice(0, 40)} | カテゴリ取得失敗: ${e.message?.slice(0, 40)}`)
          }
        }

        // ③: ロジ収集
        const enrichedEvent = eventResult.location ? { ...event, location: eventResult.location } : event
        const logiResult = await enrichLogi(enrichedEvent, { dryRun: DRY_RUN }).catch((e) => ({ success: false, error: e.message }))
        if (logiResult.success) {
          totalLogiOk++
          console.log(`  [logi]   OK  ${event.name?.slice(0, 40)}`)
        } else {
          totalLogiErr++
          console.log(`  [logi]   ERR ${event.name?.slice(0, 40)} | ${logiResult.error?.slice(0, 50)}`)
        }

        // ⑤: 翻訳（name_en が未設定の場合のみ）
        const transResult = await translateEvent(event, { dryRun: DRY_RUN }).catch((e) => ({ success: false, error: e.message }))
        if (transResult.success) {
          console.log(`  [trans]  OK  ${event.name?.slice(0, 40)}`)
        } else {
          console.log(`  [trans]  ERR ${event.name?.slice(0, 40)} | ${transResult.error?.slice(0, 50)}`)
        }
      })
    )

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

  console.log('=== サマリー ===')
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
