/**
 * 単一イベントの詳細エンリッチ診断スクリプト
 * 指定 URL のページを取得し、LLM の抽出結果を詳細表示する（DB 書き込みなし）
 *
 * 使い方:
 *   node scripts/crawl/test-single.js --url <official_url>
 *   node scripts/crawl/test-single.js --url https://www.nature-scene.net/myoko/
 */
import Anthropic from '@anthropic-ai/sdk'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import * as cheerio from 'cheerio'

const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  })
}

const args = process.argv.slice(2)
const urlIdx = args.indexOf('--url')
const TARGET_URL = urlIdx >= 0 ? args[urlIdx + 1] : null
if (!TARGET_URL) {
  console.error('使い方: node test-single.js --url <url>')
  process.exit(1)
}

const SYSTEM_PROMPT = `あなたはレースイベントの情報抽出エキスパートです。
与えられたページの内容から、以下の JSON 形式で情報を抽出してください。

{
  "event": {
    "name": "正式な大会名",
    "event_date": "YYYY-MM-DD（開催初日）",
    "event_date_end": "YYYY-MM-DD（複数日の場合の最終日）",
    "location": "開催地（都市名, 国）",
    "country": "国名（日本語）",
    "race_type": "spartan|trail|hyrox|obstacle|adventure|marathon|triathlon|devils_circuit|strong_viking|other のいずれか",
    "entry_url": "申込URL",
    "entry_start": "YYYY-MM-DD（申込開始日）",
    "entry_end": "YYYY-MM-DD（申込終了日）",
    "reception_place": "受付場所",
    "start_place": "スタート場所"
  },
  "categories": [
    {
      "name": "カテゴリ名",
      "distance_km": 数値,
      "elevation_gain": 数値（メートル）,
      "entry_fee": 数値（現地通貨）,
      "entry_fee_currency": "JPY|USD|EUR 等",
      "start_time": "HH:MM",
      "reception_end": "HH:MM（受付終了時間）",
      "time_limit": "HH:MM:SS",
      "cutoff_times": [{"point": "地点名", "time": "HH:MM"}],
      "mandatory_gear": "必携品リスト",
      "poles_allowed": true/false,
      "itra_points": 数値（ITRA ポイント数）
    }
  ]
}

ルール:
- ページに記載がない項目は null にする。推測しない
- 日付は YYYY-MM-DD 形式
- entry_fee は現地通貨の数値
- cutoff_times はカットオフ地点ごとに配列で
- itra_points は ITRA ポイントの数値のみ
- JSON のみ返す`

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'YabaiTravel-Crawl/1.0' },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.text()
}

/** テキスト抽出（テーブルも含めて構造を保持） */
function extractContent(html, maxChars = 10000) {
  const $ = cheerio.load(html)
  $('script, style, svg, iframe, noscript').remove()
  $('[class*="cookie"], [class*="banner"], [class*="popup"], [class*="modal"], [class*="newsletter"]').remove()

  // テーブルを読みやすいテキストに変換
  $('table').each((_, table) => {
    const rows = []
    $(table).find('tr').each((_, tr) => {
      const cells = []
      $(tr).find('th, td').each((_, td) => {
        cells.push($(td).text().trim().replace(/\s+/g, ' '))
      })
      if (cells.some(Boolean)) rows.push(cells.join(' | '))
    })
    $(table).replaceWith(rows.join('\n'))
  })

  const text = $('body').text().replace(/\s+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  return text.length <= maxChars ? text : text.slice(0, maxChars) + '\n[...truncated]'
}

/** 同一ドメインの関連リンクを抽出 */
function extractLinks(html, baseUrl) {
  const $ = cheerio.load(html)
  const base = new URL(baseUrl)
  const links = []
  const PATTERNS = ['/schedule', '/about', '/course', '/entry', '/rule', '/access', '/info', '/detail', '/category', '/distance', '/fee', '/registration', '/gear', '/equipment']

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return
    try {
      const abs = href.startsWith('http') ? href : new URL(href, baseUrl).href
      const parsed = new URL(abs)
      if (parsed.hostname !== base.hostname) return
      const path = parsed.pathname.toLowerCase()
      if (PATTERNS.some((p) => path.includes(p)) && !links.includes(abs)) {
        links.push(abs)
      }
    } catch { /* ignore */ }
  })
  return links
}

async function callLlm(anthropic, content, label) {
  console.log(`\n📤 LLM 送信: ${label} (${content.length} chars)`)
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `ページ内容:\n\n${content}` }],
  })
  const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  const result = jsonMatch ? JSON.parse(jsonMatch[0]) : null
  console.log(`📥 LLM 結果: tokens=${msg.usage.input_tokens}+${msg.usage.output_tokens}`)
  return result
}

async function run() {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  console.log(`\n${'='.repeat(60)}`)
  console.log(`🔍 診断: ${TARGET_URL}`)
  console.log('='.repeat(60))

  // Pass 1: メインページ
  console.log('\n--- Pass 1: メインページ取得 ---')
  const mainHtml = await fetchHtml(TARGET_URL)
  const mainContent = extractContent(mainHtml)
  console.log(`取得: ${mainContent.length} chars`)

  const pass1 = await callLlm(anthropic, mainContent, 'Pass1: メインページ')
  console.log('\n📊 Pass 1 抽出結果:')
  console.log(JSON.stringify(pass1, null, 2))

  // 関連リンク抽出
  const links = extractLinks(mainHtml, TARGET_URL)
  console.log(`\n🔗 関連リンク (${links.length}件): ${links.join(', ')}`)

  // Pass 2: 関連ページを最大5件
  if (links.length > 0) {
    console.log('\n--- Pass 2: 関連ページ探索 ---')
    let merged = pass1
    for (const link of links.slice(0, 5)) {
      try {
        console.log(`\n取得中: ${link}`)
        const html = await fetchHtml(link)
        const content = extractContent(html)
        const result = await callLlm(anthropic, content, `Pass2: ${link}`)
        console.log(`追加抽出:`)
        console.log(JSON.stringify(result, null, 2))
      } catch (e) {
        console.log(`  ❌ 失敗: ${e.message}`)
      }
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('✅ 診断完了')
  console.log('='.repeat(60))
}

run().catch((e) => { console.error(e); process.exit(1) })
