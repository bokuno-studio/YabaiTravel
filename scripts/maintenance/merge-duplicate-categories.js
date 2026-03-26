/**
 * 重複カテゴリマージスクリプト (#409)
 *
 * 同一イベント内で同一 distance_km を持つ重複カテゴリを統合する。
 *
 * 処理フロー:
 * 1. (event_id, distance_km) が重複するカテゴリグループを検出
 * 2. 各グループで non-null フィールド数が最多のレコードを「残す」レコードに選定
 * 3. 削除対象の参照（event_comments, change_requests）を残すレコードに付け替え
 * 4. 削除対象のカテゴリを削除
 *
 * 使い方:
 *   node scripts/maintenance/merge-duplicate-categories.js --dry-run   # 確認のみ
 *   node scripts/maintenance/merge-duplicate-categories.js              # 実行
 */
import pg from 'pg'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  })
}

const DRY_RUN = process.argv.includes('--dry-run')
const SCHEMA = process.env.SUPABASE_SCHEMA ?? 'yabai_travel'

// Category columns to score (non-null = +1 point each)
const SCORE_COLUMNS = [
  'name', 'name_en', 'distance_km', 'elevation_gain',
  'start_time', 'reception_end', 'reception_place', 'reception_place_en',
  'start_place', 'start_place_en', 'finish_rate', 'time_limit',
  'cutoff_times', 'required_pace', 'required_pace_en',
  'required_climb_pace', 'required_climb_pace_en',
  'mandatory_gear', 'mandatory_gear_en',
  'recommended_gear', 'recommended_gear_en',
  'prohibited_items', 'prohibited_items_en',
  'poles_allowed', 'entry_fee', 'entry_fee_currency', 'itra_points',
  'stay_status',
]

function scoreCategory(row) {
  let score = 0
  for (const col of SCORE_COLUMNS) {
    if (row[col] !== null && row[col] !== undefined) {
      score++
    }
  }
  return score
}

async function run() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  console.log(`=== 重複カテゴリマージ (DRY_RUN: ${DRY_RUN}) ===\n`)

  // 1. Find duplicate groups
  const dupes = await client.query(`
    SELECT event_id, distance_km, count(*) as cnt,
           array_agg(id) as cat_ids, array_agg(name) as cat_names
    FROM ${SCHEMA}.categories
    WHERE distance_km IS NOT NULL
    GROUP BY event_id, distance_km
    HAVING count(*) > 1
    ORDER BY count(*) DESC
  `)

  console.log(`重複グループ数: ${dupes.rows.length}\n`)

  if (dupes.rows.length === 0) {
    console.log('重複カテゴリはありません。')
    await client.end()
    return
  }

  await client.query('BEGIN')

  try {
    let totalMerged = 0
    let totalDeleted = 0
    let totalCommentsMoved = 0
    let totalChangeRequestsMoved = 0

    for (const group of dupes.rows) {
      // Get event name for logging
      const ev = await client.query(
        `SELECT name FROM ${SCHEMA}.events WHERE id = $1`,
        [group.event_id]
      )
      const eventName = ev.rows[0]?.name ?? '(unknown)'

      // Fetch full category rows for scoring
      const cats = await client.query(
        `SELECT * FROM ${SCHEMA}.categories WHERE id = ANY($1)`,
        [group.cat_ids]
      )

      // Score each category
      const scored = cats.rows.map(row => ({
        ...row,
        score: scoreCategory(row),
      }))
      scored.sort((a, b) => b.score - a.score) // highest score first

      const keep = scored[0]
      const deletes = scored.slice(1)

      console.log(`--- ${eventName} | distance_km=${group.distance_km} ---`)
      console.log(`  KEEP: "${keep.name}" (id=${keep.id}, score=${keep.score})`)
      for (const d of deletes) {
        console.log(`  DELETE: "${d.name}" (id=${d.id}, score=${d.score})`)
      }

      for (const del of deletes) {
        // Move event_comments references
        const comments = await client.query(
          `SELECT count(*) as cnt FROM ${SCHEMA}.event_comments WHERE category_id = $1`,
          [del.id]
        )
        if (parseInt(comments.rows[0].cnt) > 0) {
          const cnt = parseInt(comments.rows[0].cnt)
          console.log(`  Moving ${cnt} event_comments`)
          totalCommentsMoved += cnt
          if (!DRY_RUN) {
            await client.query(
              `UPDATE ${SCHEMA}.event_comments SET category_id = $1 WHERE category_id = $2`,
              [keep.id, del.id]
            )
          }
        }

        // Move change_requests references
        const crs = await client.query(
          `SELECT count(*) as cnt FROM ${SCHEMA}.change_requests WHERE category_id = $1`,
          [del.id]
        )
        if (parseInt(crs.rows[0].cnt) > 0) {
          const cnt = parseInt(crs.rows[0].cnt)
          console.log(`  Moving ${cnt} change_requests`)
          totalChangeRequestsMoved += cnt
          if (!DRY_RUN) {
            await client.query(
              `UPDATE ${SCHEMA}.change_requests SET category_id = $1 WHERE category_id = $2`,
              [keep.id, del.id]
            )
          }
        }

        // Delete the duplicate category
        if (!DRY_RUN) {
          await client.query(
            `DELETE FROM ${SCHEMA}.categories WHERE id = $1`,
            [del.id]
          )
        }
        totalDeleted++
      }
      totalMerged++
    }

    if (DRY_RUN) {
      console.log(`\n=== DRY RUN 完了 ===`)
      console.log(`Would merge: ${totalMerged} groups`)
      console.log(`Would delete: ${totalDeleted} duplicate categories`)
      console.log(`Would move: ${totalCommentsMoved} event_comments, ${totalChangeRequestsMoved} change_requests`)
      await client.query('ROLLBACK')
    } else {
      await client.query('COMMIT')
      console.log(`\n=== マージ完了 ===`)
      console.log(`Merged: ${totalMerged} groups`)
      console.log(`Deleted: ${totalDeleted} duplicate categories`)
      console.log(`Moved: ${totalCommentsMoved} event_comments, ${totalChangeRequestsMoved} change_requests`)
    }

    // Verification
    const verify = await client.query(`
      SELECT event_id, distance_km, count(*) as cnt
      FROM ${SCHEMA}.categories
      WHERE distance_km IS NOT NULL
      GROUP BY event_id, distance_km
      HAVING count(*) > 1
    `)
    console.log(`\n=== 残存重複チェック ===`)
    if (verify.rows.length === 0) {
      console.log('(event_id, distance_km) の重複: 0 (OK)')
    } else {
      console.log(`(event_id, distance_km) の重複: ${verify.rows.length} グループ残存`)
    }
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('ERROR - rolled back:', e.message)
    throw e
  }

  await client.end()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
