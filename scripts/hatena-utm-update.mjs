import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load environment variables
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(envPath)) {
    throw new Error('.env.local not found')
  }
  const content = fs.readFileSync(envPath, 'utf-8')
  const env = {}
  for (const line of content.split('\n')) {
    const match = line.match(/^([^=]+)=(.*)$/)
    if (match) {
      env[match[1].trim()] = match[2].trim()
    }
  }
  return env
}

const env = loadEnv()
const HATENA_USER = env.HATENA_USER
const HATENA_BLOG_ID = env.HATENA_BLOG_ID
const HATENA_API_KEY = env.HATENA_API_KEY

if (!HATENA_USER || !HATENA_BLOG_ID || !HATENA_API_KEY) {
  throw new Error('Hatena credentials missing')
}

// Construct entry list endpoint
const HATENA_ENTRY_URL = `https://blog.hatena.ne.jp/${HATENA_USER}/${HATENA_BLOG_ID}/atom/entry`

// Target articles with B案: related links at end
const targetArticles = [
  {
    titlePattern: /ロゲイニング入門ガイド/i,
    utm_content: 'endurance-races-japan',
    linkTarget: '/ja/',
    linkText: 'YabaiTravel - 日本のレース検索'
  },
  {
    titlePattern: /マラソン遠征ガイド/i,
    utm_content: 'marathon-guide',
    linkTarget: '/ja/guide/marathon',
    linkText: 'YabaiTravel - マラソン遠征ガイド'
  },
  {
    titlePattern: /東京から日帰りで行けるトレイルランニング/i,
    utm_content: 'trail-running-tokyo',
    linkTarget: '/ja/guide/trail',
    linkText: 'YabaiTravel - トレイルラン大会検索'
  },
  {
    titlePattern: /日本の障害物レース.*OCR/i,
    utm_content: 'spartan-japan',
    linkTarget: '/ja/',
    linkText: 'YabaiTravel - 障害物レース検索'
  },
  {
    titlePattern: /HYROX完全ガイド/i,
    utm_content: 'hyrox-japan',
    linkTarget: '/ja/',
    linkText: 'YabaiTravel - HYROX大会検索'
  }
]

// Create Basic auth header
function getAuthHeader() {
  const credentials = `${HATENA_USER}:${HATENA_API_KEY}`
  const encoded = Buffer.from(credentials).toString('base64')
  return `Basic ${encoded}`
}

// Fetch Atom feed
async function fetchAtomFeed() {
  console.log(`📡 Fetching from: ${HATENA_ENTRY_URL}`)
  const response = await fetch(HATENA_ENTRY_URL, {
    headers: {
      'Authorization': getAuthHeader()
    }
  })
  if (!response.ok) {
    throw new Error(`Hatena API error: ${response.status} ${response.statusText}`)
  }
  return response.text()
}

// Parse XML entries
function parseXml(xml) {
  const entries = []
  const entryRegex = /<entry[^>]*>[\s\S]*?<\/entry>/g
  const matches = xml.match(entryRegex) || []

  for (const entry of matches) {
    const titleMatch = entry.match(/<title[^>]*>([^<]+)<\/title>/)
    const editLinkMatch = entry.match(/<link[^>]*rel=['"](edit)['"]\s+href=['"](https?:\/\/[^'"]+)['"]/i)
    const contentMatch = entry.match(/<content[^>]*type=['"](xhtml|html)['"]\s*>[\s\S]*?<!\[CDATA\[([\s\S]*?)\]\]><\/content>/)

    if (titleMatch && editLinkMatch) {
      entries.push({
        title: titleMatch[1],
        editLink: editLinkMatch[2],
        content: contentMatch ? contentMatch[2] : '',
        fullEntry: entry
      })
    }
  }

  return entries
}

// Add related links section at end of content
function addRelatedLinksSection(content, linkTarget, linkText, utm_content) {
  // Build the UTM-tagged URL
  const utmUrl = `https://yabai.travel${linkTarget}?utm_source=hatena&utm_medium=blog&utm_campaign=cycle10&utm_content=${utm_content}`

  // Create related links section in Markdown format (Hatena supports it)
  const relatedLinksHtml = `
---

## 関連リンク

[${linkText}](${utmUrl})`

  // Remove any existing related links section
  let cleanContent = content.replace(/\n?---\s*\n##\s*関連リンク[\s\S]*?(?=\n|$)/g, '')

  // Append new related links section
  return cleanContent + relatedLinksHtml
}

// Update article
async function updateArticle(editLink, title, newContent) {
  const entryXml = `<?xml version="1.0" encoding="UTF-8"?>
<entry xmlns="http://www.w3.org/2005/Atom">
  <title>${title}</title>
  <content type="xhtml">
    <div xmlns="http://www.w3.org/1999/xhtml">
      <![CDATA[${newContent}]]>
    </div>
  </content>
</entry>`

  const response = await fetch(editLink, {
    method: 'PUT',
    headers: {
      'Authorization': getAuthHeader(),
      'Content-Type': 'application/atom+xml; charset=utf-8'
    },
    body: entryXml
  })

  if (!response.ok) {
    throw new Error(`Update failed (${response.status}): ${await response.text()}`)
  }

  return response.text()
}

// Main
async function main() {
  console.log('=== Hatena Related Links Update (B案) ===\n')

  try {
    console.log('📥 Fetching Atom feed...')
    const feedXml = await fetchAtomFeed()

    console.log('📄 Parsing entries...')
    const entries = parseXml(feedXml)
    console.log(`Found ${entries.length} entries\n`)

    let processedCount = 0
    let updatedCount = 0

    for (const target of targetArticles) {
      const matching = entries.find(e => target.titlePattern.test(e.title))

      if (!matching) {
        console.log(`❌ [${target.utm_content}] Article not found`)
        continue
      }

      console.log(`✓ [${target.utm_content}] "${matching.title}"`)

      // Add related links section with UTM parameters
      const newContent = addRelatedLinksSection(
        matching.content,
        target.linkTarget,
        target.linkText,
        target.utm_content
      )

      if (newContent === matching.content) {
        console.log(`  ℹ No changes needed`)
        processedCount++
        continue
      }

      console.log(`  🔄 Updating with related links...`)
      try {
        await updateArticle(matching.editLink, matching.title, newContent)
        console.log(`  ✅ Updated`)
        updatedCount++
        processedCount++
      } catch (err) {
        console.error(`  ❌ ${err.message}`)
      }
    }

    console.log(`\n📊 Summary: ${processedCount}/5 processed, ${updatedCount} updated`)
  } catch (err) {
    console.error(`❌ Error: ${err.message}`)
    process.exit(1)
  }
}

main()
