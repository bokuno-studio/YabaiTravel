/**
 * attempt_count >= 3 で enrich 停止中のレコードを精査
 * - URL フィルタに該当 → DELETE
 * - last_error_type = 'temporary' → attempt_count リセット
 * - last_error_type = 'not_available' → HTTP チェックして 404/403 なら DELETE、200 なら リセット
 *
 * 使い方: node scripts/crawl/cleanup-maxed-retries.js [--dry-run]
 */
import pg from 'pg'
import { loadEnv } from './lib/enrich-utils.js'

loadEnv()
const SCHEMA = process.env.SUPABASE_SCHEMA ?? 'yabai_travel'
const DRY_RUN = process.argv.includes('--dry-run')

const JUNK_URL_PATTERNS = [
  /\/(results?|classement|palmares|rankings?)(\/|$|\?)/i,
  /\/(category|tag|categorie|tags|categories)(\/|$|\?)/i,
  /\/(terms|privacy|legal|cgu|cgv|mentions-legales|contact|about|faq|help|blog|news|press|sponsors?)(\/|$|\?)/i,
  /\/(login|signup|register|cart|checkout|account)(\/|$|\?)/i,
  /\/(archives?|page\/\d+)(\/|$|\?)/i,
  /le-sportif\.com.*\/result/i,
  /timeoutdoors\.com.*\/categor/i,
  /finishers\.com.*\/tag/i,
]

function isJunkUrl(url) {
  if (!url) return false
  return JUNK_URL_PATTERNS.some((p) => p.test(url))
}

async function checkUrl(url) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    })
    clearTimeout(timeout)
    return res.status
  } catch {
    return 0
  }
}

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  const { rows } = await client.query(
    `SELECT id, name, official_url, attempt_count, last_error_type, last_error_message
     FROM ${SCHEMA}.events
     WHERE attempt_count >= 3 AND collected_at IS NULL
     ORDER BY last_error_type, name`
  )

  console.log(`対象: ${rows.length} 件 (attempt_count >= 3, collected_at IS NULL)${DRY_RUN ? ' [DRY RUN]' : ''}`)

  let deleted = 0
  let reset = 0

  for (const row of rows) {
    const label = `${row.name?.slice(0, 50)} (${row.official_url?.slice(0, 60)})`

    // 1. URL フィルタに該当 → DELETE
    if (isJunkUrl(row.official_url)) {
      console.log(`  DELETE (junk URL): ${label}`)
      if (!DRY_RUN) {
        await client.query(`DELETE FROM ${SCHEMA}.events WHERE id = $1`, [row.id])
      }
      deleted++
      continue
    }

    // 2. temporary → リセット
    if (row.last_error_type === 'temporary') {
      console.log(`  RESET (temporary): ${label}`)
      if (!DRY_RUN) {
        await client.query(
          `UPDATE ${SCHEMA}.events SET attempt_count = 0, last_error_type = NULL, last_attempted_at = NULL WHERE id = $1`,
          [row.id]
        )
      }
      reset++
      continue
    }

    // 3. not_available → HTTP チェック
    if (row.last_error_type === 'not_available' && row.official_url) {
      const status = await checkUrl(row.official_url)
      if (status === 404 || status === 403 || status === 0) {
        console.log(`  DELETE (HTTP ${status}): ${label}`)
        if (!DRY_RUN) {
          await client.query(`DELETE FROM ${SCHEMA}.events WHERE id = $1`, [row.id])
        }
        deleted++
      } else {
        console.log(`  RESET (HTTP ${status}): ${label}`)
        if (!DRY_RUN) {
          await client.query(
            `UPDATE ${SCHEMA}.events SET attempt_count = 0, last_error_type = NULL, last_attempted_at = NULL WHERE id = $1`,
            [row.id]
          )
        }
        reset++
      }
      continue
    }

    // 4. その他のエラー → ログのみ（手動判断）
    console.log(`  SKIP (${row.last_error_type}): ${label}`)
  }

  await client.end()
  console.log(`\n完了: 削除 ${deleted} 件, リセット ${reset} 件`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
