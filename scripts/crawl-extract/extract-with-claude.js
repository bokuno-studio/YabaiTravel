/**
 * Claude Haiku による抽出スクリプト（比較用）
 * HTML の該当部分を LLM に渡し、構造化 JSON を取得
 *
 * 使い方: node scripts/crawl-extract/extract-with-claude.js [a-extremo|golden-trail]
 * 要: ANTHROPIC_API_KEY
 */
import Anthropic from '@anthropic-ai/sdk'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  })
}

const SOURCES = {
  'a-extremo': { url: 'https://www.a-extremo.com/event/extreme/' },
  'golden-trail': { url: 'https://goldentrailseries.com/serie/world-series/' },
}

const SYSTEM_PROMPT = `あなたはレース情報を抽出するアシスタントです。
HTML から大会名・開催日・公式URL・場所を抽出し、以下の JSON 形式で返してください。
日付は YYYY-MM-DD 形式に変換してください。

{
  "races": [
    {
      "name": "大会名",
      "event_date": "YYYY-MM-DD",
      "official_url": "https://...",
      "entry_url": "https://...",
      "location": "開催地",
      "race_type": "trail|adventure|spartan 等"
    }
  ]
}

JSON のみを返し、説明は不要です。`

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'YabaiTravel-Crawl/1.0' },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
  return res.text()
}

/** HTML を短縮（レース一覧らしき部分を抽出） */
function truncateForLlm(html, maxChars = 15000) {
  // テーブルやリスト部分を優先
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) || []
  const sections = html.match(/<section[\s\S]*?<\/section>/gi) || []
  const combined = [...tables, ...sections].join('\n')
  const target = combined.length > 500 ? combined : html
  return target.slice(0, maxChars)
}

async function extractWithClaude(sourceKey) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY が未設定です')

  const { url } = SOURCES[sourceKey]
  if (!url) throw new Error(`Unknown source: ${sourceKey}`)

  const html = await fetchHtml(url)
  const truncated = truncateForLlm(html)

  const client = new Anthropic({ apiKey })
  const msg = await client.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `以下の HTML からレース情報を抽出してください。\n\n${truncated}`,
      },
    ],
  })

  const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('LLM が JSON を返しませんでした')

  const parsed = JSON.parse(jsonMatch[0])
  return { source: url, races: parsed.races || [], source_key: sourceKey, method: 'claude' }
}

// CLI
const sourceKey = process.argv[2] || 'a-extremo'
if (sourceKey in SOURCES) {
  extractWithClaude(sourceKey)
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => {
      console.error(e.message)
      process.exit(1)
    })
} else {
  console.error('Usage: node extract-with-claude.js [a-extremo|golden-trail]')
  process.exit(1)
}
