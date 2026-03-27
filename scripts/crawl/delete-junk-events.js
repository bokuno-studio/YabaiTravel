/**
 * ゴミデータ（誤抽出）の events を削除
 * categories, access_routes, accommodations は CASCADE で自動削除
 *
 * 使い方: node scripts/crawl/delete-junk-events.js
 */
import pg from 'pg'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  })
}

const JUNK_PATTERNS = [
  /TICKET PRICES RISE.*REGISTER NOW/i,
  /^エントリー\s*\d{4}\.\d{2}\.\d{2}/m,
  /^【スポーツの話題はこちら】/,
  /^プレスリリース$/i,
  /^主催者の皆さまへ$/i,
  /^大会主催者の方へ$/i,
  /^Online Shop$/i,
  /^エントリーガイド$/i,
  /^shopping_cart$/i,
  /^Sign in$/i,
  /^Orders$/i,
  /^ARE YOU READY\? SAY OORAH$/i,
]

/** URL ベースのジャンク判定パターン */
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

/** エンデュランス系ではないイベントを除外するキーワード (#67) */
const NON_ENDURANCE_KEYWORDS = /スカッシュ|バドミントン|テニス|ゴルフ|卓球|ボウリング|ダーツ|ビリヤード|ゲートボール|クリケット|カーリング|アーチェリー|射撃|フェンシング|レスリング|柔道|空手|剣道|弓道|相撲|ボクシング|ラグビー|サッカー|フットサル|バレーボール|バスケ|ハンドボール|野球|ソフトボール|ホッケー|クリテリウム|ヒルクライム|サイクリング|自転車[旅競]|ロードレース(?!.*ラン)|エンデューロ(?!.*ラン)|練習会|走行会|トーナメント|選手権(?!.*マラソン|.*トレイル|.*トライアスロン|.*ラン)|プロアマ|グラベル/i

async function run() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  const { rows } = await client.query(
    'SELECT id, name, official_url FROM yabai_travel.events'
  )

  const toDelete = rows.filter((r) => {
    const t = r.name?.trim() ?? ''
    return JUNK_PATTERNS.some((p) => p.test(t)) || NON_ENDURANCE_KEYWORDS.test(t) || isJunkUrl(r.official_url)
  })
  console.log(`ゴミ候補: ${toDelete.length} 件`)
  toDelete.forEach((r) => console.log(`  - ${r.name?.slice(0, 50)}... (${r.official_url})`))

  for (const r of toDelete) {
    await client.query('DELETE FROM yabai_travel.events WHERE id = $1', [r.id])
    console.log(`削除: ${r.name?.slice(0, 40)}`)
  }

  await client.end()
  console.log(`\n完了: ${toDelete.length} 件削除`)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
