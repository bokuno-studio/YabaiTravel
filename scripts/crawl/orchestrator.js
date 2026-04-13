/**
 * ④ オーケストレータ
 * 次期版では ②-A enrichEvent のみ実行
 *
 * 使い方:
 *   node scripts/crawl/orchestrator.js              # 全件（従来モード）
 *   node scripts/crawl/orchestrator.js --batch      # Batch API モード（②-A で 50% コスト削減）
 *   node scripts/crawl/orchestrator.js --limit 50   # 50件のみ処理
 *   node scripts/crawl/orchestrator.js --dry-run    # DB更新なし
 *   node scripts/crawl/orchestrator.js --once       # 1バッチのみ
 *   node scripts/crawl/orchestrator.js --concurrency 10
 */
import pg from 'pg'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { enrichEvent, runOrchestratedEventBatch } from './enrich-event.js'
import { InsufficientBalanceError } from './lib/enrich-utils.js'
// translateEvent は廃止（#316: 全ステップで日英同時抽出に統一）

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
const BATCH = args.includes('--batch')                // Batch API モード（②-A で使用）
const concurrencyIdx = args.indexOf('--concurrency')
const CONCURRENCY = concurrencyIdx >= 0 ? parseInt(args[concurrencyIdx + 1], 10) : 20
const limitIdx = args.indexOf('--limit')
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : null

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
  console.log(`=== オーケストレータ開始 (DRY_RUN: ${DRY_RUN}, BATCH: ${BATCH}, CONCURRENCY: ${CONCURRENCY}, ONCE: ${ONCE}, LIMIT: ${LIMIT ?? 'なし'}) ===\n`)

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  // ②-A 未処理イベント（統一リトライ: collected_at IS NULL AND attempt_count < 3）
  const limitClause = LIMIT ? ` LIMIT ${LIMIT}` : ''
  const { rows: needsEventEnrich } = await client.query(
    `SELECT id, name, official_url, location, country, country_en, race_type, FALSE as event_done
     FROM ${SCHEMA}.events
     WHERE collected_at IS NULL
       AND deleted_at IS NULL
       AND attempt_count < 3
     ORDER BY
       CASE WHEN attempt_count = 0 THEN 0 ELSE 1 END,
       updated_at ASC${limitClause}`
  )

  const useBatchMode = BATCH

  // ②-A Batch モード時: 前回 pending確認（24h以内pending → スキップ）
  if (useBatchMode) {
    const { rows: [pending] } = await client.query(
      `SELECT batch_id FROM ${SCHEMA}.batch_jobs WHERE status='pending' AND created_at > NOW() - interval '24 hours' LIMIT 1`
    )
    if (pending) {
      console.log(`[batch] 前回バッチ処理中 (batch_id: ${pending.batch_id})。スキップします`)
      await client.end()
      return
    }
  }

  await client.end()

  const seenIds = new Set()
  const pendingEvents = []
  for (const ev of needsEventEnrich) {
    if (seenIds.has(ev.id)) continue
    seenIds.add(ev.id)
    pendingEvents.push(ev)
  }
  console.log(`処理対象: ${pendingEvents.length} 件（②-A未処理のみ, Batch: ${useBatchMode}）\n`)

  if (pendingEvents.length === 0) {
    console.log('処理対象なし。終了します。')
    return
  }

  let totalEventOk = 0
  let totalEventErr = 0

  // ②-A: Batch モード時の一括処理（Batch API で 50% コスト削減）
  if (useBatchMode) {
    // Batch モード: needsEventEnrich 全件を一度に処理
    const batchEventResult = await runOrchestratedEventBatch(needsEventEnrich, { dryRun: DRY_RUN })
    totalEventOk = batchEventResult.ok
    totalEventErr = batchEventResult.err

    if (ONCE) {
      console.log('--once フラグ指定ですが、Batch 実装では単回実行です。')
    }
  } else {
    throw new Error('orchestrator.js now requires --batch because Step2 must use Batch API only')
  }

  console.log('\n=== サマリー ===')
  console.log(`イベント情報:     OK ${totalEventOk} / ERR ${totalEventErr}`)

  // アラート Issue 自動起票は無効化（Telegram レポートに一本化）
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
