/**
 * 重複イベントクリーンアップスクリプト (#387)
 *
 * 処理フロー:
 * 1. 各重複グループごとに「残すレコード」と「削除するレコード」を定義
 * 2. 削除対象のcategoriesを残すレコードに紐付け替え
 * 3. 削除対象のaccess_routes, accommodationsを削除
 * 4. 削除対象のeventsを削除
 * 5. ゴミデータ（ハードコア161km全件、・祝）レコード）を完全削除
 *
 * 使い方:
 *   node scripts/maintenance/cleanup-duplicate-events.js --dry-run   # 確認のみ
 *   node scripts/maintenance/cleanup-duplicate-events.js              # 実行
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

/**
 * 重複グループ定義
 * keep: 残すレコードのID
 * delete: 削除するレコードのID群
 * reason: 削除理由
 */
const DUPLICATE_GROUPS = [
  {
    name: 'あだち五色桜マラソン (space diff)',
    keep: '3f3d7724-b808-4a83-8c4c-2dd61877338d',   // 第14回あだち五色桜マラソン大会 (3 categories)
    delete: ['5ba9a795-350e-4ab1-bd77-0021c282ef4f'], // 第14回 あだち五色桜マラソン大会 (1 category)
    reason: 'Space in name, same official_url, fewer categories',
  },
  {
    name: '臨港パークあおぞら駅伝 (space diff, different dates)',
    keep: 'ba553696-2f11-4c67-a258-f5877d74d31b',   // has official_url, 8 categories
    delete: ['1c093924-6da4-41a2-ada9-303fe61aa4b9'], // no official_url initially, 5 categories
    reason: 'Space in name, keep has more categories and official_url',
  },
  {
    name: 'スポーツメイトラン北千住荒川 (space diff, multi-source)',
    keep: '09a99f8d-4a81-4237-b951-8188f42d31c9',   // sportsmate.net, 3 categories
    delete: ['370bc52e-a6f8-41eb-9ab2-bc7abe23aae6'], // spopita.jp, 1 category
    reason: 'Space in name, multi-source duplicate',
  },
  {
    name: 'UPRUN市川江戸川 (space diff, multi-source)',
    keep: '8bbcdc00-021e-46cb-8a2f-fd777068e68f',   // up-run.jp, 3 categories
    delete: ['9b60719b-df87-4716-aa72-7d021a56a119'], // up-run.jp/events, 4 categories (but keep the root domain)
    reason: 'Space in name, multi-source duplicate',
  },
  {
    name: 'あさくらサイクルフェスティバル (Korean + Japanese)',
    keep: 'a6b42664-1013-41e0-96b8-a83de27ef11a',   // Japanese name, correct URL, 4 categories
    delete: ['31a3dbda-3734-43dd-8086-a9745435e26d'], // Korean name, wrong URL (marathon.tokyo PDF)
    reason: 'Korean duplicate with unrelated official_url',
  },
  {
    name: 'バイクナビグランプリ (punctuation diff)',
    keep: '41478a71-9b57-4908-81bc-33673e4c1507',   // 2 categories
    delete: ['aaf51523-b8c8-40f1-a8a3-f42124f71289'], // 2 categories, same URL
    reason: 'Punctuation/space diff in name, same official_url',
  },
  {
    name: '真駒内桜マラソン (junk name variant)',
    keep: '481f8abb-60f9-4111-8b30-38054e889bbc',   // clean name, 2 categories
    delete: ['f06ed5df-03fd-4df0-bcec-e61d9f8a33b9'], // junk prefix ・祝）, 2 categories
    reason: 'Junk characters in name prefix',
  },
  {
    name: '大阪淀川ナイトマラソン (exact duplicate)',
    keep: 'b7c9729b-abe5-4c84-aede-88513c4ed2eb',   // 1 category
    delete: ['d6d0acb2-529f-4d0a-bd33-d2ee24fefe90'], // 3 categories, same URL+date
    reason: 'Exact duplicate, same official_url and event_date',
  },
  {
    name: 'PSS皇居健康ラン (category prefix in name)',
    keep: '6f2dff25-d4e6-4595-84d0-22fd70f2a103',   // 猛暑対策 variant, has event_date
    delete: ['6b8f6cfc-08cd-4ee3-9034-784fd7144039'], // 30Kの部 prefix, no event_date
    reason: 'Category prefix in name, no event_date',
  },
]

/**
 * ゴミデータ: 完全削除（残すレコードなし）
 */
const JUNK_DELETE_ALL = [
  // ハードコア161km: 全6件とも official_url がレース無関係
  '12dfec20-7110-45dd-866d-7f5d92d181c2',
  '63c25140-bbba-49c9-99db-49d83a00e6ed',
  '90d5ffdc-f0ec-4dd1-80a2-9ca5ab5bbdec',
  'a4d415f0-f723-417b-8fd3-b1070fe4e0dd',
  'bc17481f-5916-4458-ae5a-642973e92565',
  'bdae3ccf-46ef-4877-a498-9168d26b9a67',
]

// NOTE: HYROX Beijing (2 records) are NOT duplicates - different dates (Mar vs Sep), different URLs.

async function run() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  console.log(`=== 重複イベントクリーンアップ (DRY_RUN: ${DRY_RUN}) ===\n`)

  // Wrap everything in a transaction
  await client.query('BEGIN')

  try {
    let totalDeleted = 0
    let totalCategoriesMoved = 0

    // --- Process duplicate groups (merge categories, then delete) ---
    for (const group of DUPLICATE_GROUPS) {
      console.log(`\n--- ${group.name} ---`)
      console.log(`  Keep: ${group.keep}`)
      console.log(`  Delete: ${group.delete.join(', ')}`)
      console.log(`  Reason: ${group.reason}`)

      for (const deleteId of group.delete) {
        // Check for categories to move
        const cats = await client.query(
          `SELECT id, name FROM ${SCHEMA}.categories WHERE event_id = $1`,
          [deleteId]
        )

        if (cats.rows.length > 0) {
          console.log(`  Categories to move from ${deleteId}: ${cats.rows.map(c => c.name).join(', ')}`)

          // Check if keep event already has categories with same names
          const keepCats = await client.query(
            `SELECT name FROM ${SCHEMA}.categories WHERE event_id = $1`,
            [group.keep]
          )
          const keepCatNames = new Set(keepCats.rows.map(c => c.name))

          for (const cat of cats.rows) {
            if (keepCatNames.has(cat.name)) {
              console.log(`    SKIP (already exists): ${cat.name}`)
              // Delete the duplicate category instead
              if (!DRY_RUN) {
                await client.query(`DELETE FROM ${SCHEMA}.categories WHERE id = $1`, [cat.id])
              }
            } else {
              console.log(`    MOVE: ${cat.name}`)
              if (!DRY_RUN) {
                await client.query(
                  `UPDATE ${SCHEMA}.categories SET event_id = $1 WHERE id = $2`,
                  [group.keep, cat.id]
                )
              }
              totalCategoriesMoved++
            }
          }
        }

        // Delete access_routes for the duplicate
        const ar = await client.query(
          `SELECT count(*) as cnt FROM ${SCHEMA}.access_routes WHERE event_id = $1`,
          [deleteId]
        )
        if (parseInt(ar.rows[0].cnt) > 0) {
          console.log(`  Delete ${ar.rows[0].cnt} access_routes`)
          if (!DRY_RUN) {
            await client.query(`DELETE FROM ${SCHEMA}.access_routes WHERE event_id = $1`, [deleteId])
          }
        }

        // Delete accommodations for the duplicate
        const acc = await client.query(
          `SELECT count(*) as cnt FROM ${SCHEMA}.accommodations WHERE event_id = $1`,
          [deleteId]
        )
        if (parseInt(acc.rows[0].cnt) > 0) {
          console.log(`  Delete ${acc.rows[0].cnt} accommodations`)
          if (!DRY_RUN) {
            await client.query(`DELETE FROM ${SCHEMA}.accommodations WHERE event_id = $1`, [deleteId])
          }
        }

        // Delete the duplicate event
        console.log(`  DELETE event: ${deleteId}`)
        if (!DRY_RUN) {
          await client.query(`UPDATE ${SCHEMA}.events SET deleted_at = NOW() WHERE id = $1`, [deleteId])
        }
        totalDeleted++
      }
    }

    // --- Process junk data (delete all, no merge needed) ---
    console.log(`\n\n--- ゴミデータ削除 (ハードコア161km 全6件) ---`)
    for (const junkId of JUNK_DELETE_ALL) {
      // Get event name for logging
      const ev = await client.query(`SELECT name, official_url FROM ${SCHEMA}.events WHERE id = $1`, [junkId])
      if (ev.rows.length === 0) {
        console.log(`  SKIP (not found): ${junkId}`)
        continue
      }
      console.log(`  DELETE: ${ev.rows[0].name} | ${ev.rows[0].official_url?.slice(0, 60)}`)

      // Delete related data
      if (!DRY_RUN) {
        await client.query(`DELETE FROM ${SCHEMA}.categories WHERE event_id = $1`, [junkId])
        await client.query(`DELETE FROM ${SCHEMA}.access_routes WHERE event_id = $1`, [junkId])
        await client.query(`DELETE FROM ${SCHEMA}.accommodations WHERE event_id = $1`, [junkId])
        await client.query(`UPDATE ${SCHEMA}.events SET deleted_at = NOW() WHERE id = $1`, [junkId])
      }
      totalDeleted++
    }

    if (DRY_RUN) {
      console.log(`\n=== DRY RUN 完了 ===`)
      console.log(`Would delete: ${totalDeleted} events`)
      console.log(`Would move: ${totalCategoriesMoved} categories`)
      await client.query('ROLLBACK')
    } else {
      await client.query('COMMIT')
      console.log(`\n=== クリーンアップ完了 ===`)
      console.log(`Deleted: ${totalDeleted} events`)
      console.log(`Moved: ${totalCategoriesMoved} categories`)
    }

    // Verification
    const verify = await client.query(
      `SELECT name_en, count(*) as cnt FROM ${SCHEMA}.events WHERE name_en IS NOT NULL GROUP BY name_en HAVING count(*) > 1 ORDER BY cnt DESC`
    )
    console.log(`\n=== 残存重複チェック ===`)
    if (verify.rows.length === 0) {
      console.log('name_en の重複: 0 (OK)')
    } else {
      console.log(`name_en の重複: ${verify.rows.length} グループ残存`)
      verify.rows.forEach(r => console.log(`  ${r.cnt}x ${r.name_en}`))
    }

    // Check junk
    const junkCheck = await client.query(
      `SELECT id, name FROM ${SCHEMA}.events WHERE name LIKE '%・祝%' OR (name = 'ハードコア161km' AND official_url NOT LIKE '%hardcore%')`
    )
    console.log(`ゴミデータ残存: ${junkCheck.rows.length}`)
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
