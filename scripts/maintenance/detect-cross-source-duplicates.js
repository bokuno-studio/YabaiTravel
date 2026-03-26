/**
 * ソース横断の重複イベント検知スクリプト (#389)
 *
 * 同じ event_date を持ち、正規化名が類似するイベントを検出してレポート出力する。
 * 自動マージは行わない（検知・レポートのみ）。
 *
 * 使い方:
 *   node scripts/maintenance/detect-cross-source-duplicates.js
 *   node scripts/maintenance/detect-cross-source-duplicates.js --verbose
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

const VERBOSE = process.argv.includes('--verbose')
const SCHEMA = process.env.SUPABASE_SCHEMA ?? 'yabai_travel'

/** 名前を正規化（重複比較用） */
function normalizeName(name) {
  return (name ?? '')
    .replace(/[\s\u3000]+/g, '')   // 全角・半角スペース除去
    .replace(/[・·\-–—]/g, '')     // 区切り文字除去
    .toLowerCase()
}

async function run() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  try {
    // event_date が同じイベントをグループ化して取得
    const { rows } = await client.query(`
      SELECT id, name, event_date::text, official_url
      FROM ${SCHEMA}.events
      WHERE event_date IS NOT NULL
      ORDER BY event_date, name
    `)

    // event_date ごとにグループ化
    const byDate = new Map()
    for (const row of rows) {
      const date = row.event_date
      if (!byDate.has(date)) byDate.set(date, [])
      byDate.get(date).push(row)
    }

    const duplicateGroups = []

    for (const [date, events] of byDate) {
      if (events.length < 2) continue

      // 正規化名でサブグループを作成
      const normalized = new Map()
      for (const ev of events) {
        const norm = normalizeName(ev.name)
        if (!norm) continue
        if (!normalized.has(norm)) normalized.set(norm, [])
        normalized.get(norm).push(ev)
      }

      // 完全一致の重複
      for (const [norm, group] of normalized) {
        if (group.length >= 2) {
          duplicateGroups.push({
            type: 'exact',
            date,
            normalizedName: norm,
            events: group,
          })
        }
      }

      // 部分一致の重複（一方が他方を含む場合）
      const normKeys = [...normalized.keys()]
      for (let i = 0; i < normKeys.length; i++) {
        for (let j = i + 1; j < normKeys.length; j++) {
          const a = normKeys[i]
          const b = normKeys[j]
          if (a.includes(b) || b.includes(a)) {
            // 既に exact で検出済みのペアはスキップ
            const eventsA = normalized.get(a)
            const eventsB = normalized.get(b)
            duplicateGroups.push({
              type: 'partial',
              date,
              normalizedNames: [a, b],
              events: [...eventsA, ...eventsB],
            })
          }
        }
      }
    }

    // レポート出力
    console.log('=== ソース横断 重複イベント検知レポート ===\n')
    console.log(`総イベント数: ${rows.length}`)
    console.log(`検出された重複グループ: ${duplicateGroups.length}\n`)

    if (duplicateGroups.length === 0) {
      console.log('重複は検出されませんでした。')
      return
    }

    // exact を先に、partial を後に
    const sorted = duplicateGroups.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'exact' ? -1 : 1
      return a.date.localeCompare(b.date)
    })

    for (const group of sorted) {
      const label = group.type === 'exact' ? '[完全一致]' : '[部分一致]'
      console.log(`${label} ${group.date}`)
      if (group.type === 'exact') {
        console.log(`  正規化名: ${group.normalizedName}`)
      } else {
        console.log(`  正規化名: ${group.normalizedNames.join(' / ')}`)
      }
      for (const ev of group.events) {
        const url = ev.official_url ? ` ${ev.official_url}` : ''
        console.log(`  - [id:${ev.id}] ${ev.name}${url}`)
      }
      if (VERBOSE) {
        console.log(`  → 対応: 手動で確認し、cleanup-duplicate-events.js で統合してください`)
      }
      console.log()
    }

    console.log(`--- レポート完了 ---`)
    console.log(`完全一致: ${sorted.filter((g) => g.type === 'exact').length} グループ`)
    console.log(`部分一致: ${sorted.filter((g) => g.type === 'partial').length} グループ`)
  } finally {
    await client.end()
  }
}

run().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
