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
const DEVTO_API_KEY = env.DEVTO_API_KEY

if (!DEVTO_API_KEY) {
  throw new Error('DEVTO_API_KEY missing')
}

const DEVTO_API_BASE = 'https://dev.to/api'

// Load dev.to config
function loadConfig() {
  const configPath = path.join(__dirname, 'devto-config.json')
  if (!fs.existsSync(configPath)) {
    throw new Error('devto-config.json not found')
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
}

// Parse markdown file
function parseMdFile(filepath) {
  const content = fs.readFileSync(filepath, 'utf-8')
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) throw new Error('Invalid markdown format (missing frontmatter)')

  const frontmatterStr = match[1]
  const body = match[2].trim()

  const frontmatter = {}
  for (const line of frontmatterStr.split('\n')) {
    const [key, ...valueParts] = line.split(':')
    if (key && valueParts.length > 0) {
      const value = valueParts.join(':').trim()
      frontmatter[key.trim()] = value.replace(/^['"]|['"]$/g, '')
    }
  }

  return { frontmatter, body }
}

// Publish article to dev.to
async function publishToDevto(title, body, canonicalUrl, tags) {
  console.log(`📝 Publishing to dev.to: "${title}"`)

  // Generate description from body
  const description = body
    .split('\n')
    .filter(line => line && !line.startsWith('#'))
    .slice(0, 3)
    .join(' ')
    .replace(/[*`[\]]/g, '')
    .substring(0, 160)

  const payload = {
    article: {
      title,
      description,
      body_markdown: body,
      published: true,
      canonical_url: canonicalUrl,
      tags: tags || ['yabaitravel', 'endurance', 'travel'],
    },
  }

  try {
    const response = await fetch(`${DEVTO_API_BASE}/articles`, {
      method: 'POST',
      headers: {
        'api-key': DEVTO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Dev.to API error (${response.status}): ${error}`)
    }

    const result = await response.json()
    console.log(`  ✅ Published: ${result.url}`)
    return result
  } catch (err) {
    console.error(`  ❌ Error: ${err.message}`)
    throw err
  }
}

// Main
async function main() {
  const config = loadConfig()
  const args = process.argv.slice(2)
  const operation = args[0]

  if (operation === 'list') {
    // List articles by status
    const status = args[1] || 'all'
    console.log(`📚 Dev.to Articles Status:\n`)

    const filtered = status === 'all'
      ? config.articles
      : config.articles.filter(a => a.status === status)

    for (const article of filtered) {
      console.log(`[${article.status.toUpperCase()}] ${article.filename}`)
      console.log(`  Title: ${article.devto_title}`)
      console.log(`  Canonical: ${article.devto_canonical}`)
      console.log(`  Tags: ${article.tags.join(', ')}\n`)
    }

    console.log(`Next scheduled publication: ${config.schedule.next_publication}`)
  } else if (operation === 'publish') {
    // Publish specified article
    const filename = args[1]
    if (!filename) {
      console.error('Usage: node devto-publish.mjs publish <filename>')
      process.exit(1)
    }

    const articleConfig = config.articles.find(a => a.filename === filename)
    if (!articleConfig) {
      console.error(`Article not found in config: ${filename}`)
      process.exit(1)
    }

    const blogDir = path.join(__dirname, '..', 'content', 'blog')
    const filepath = path.join(blogDir, filename)

    if (!fs.existsSync(filepath)) {
      console.error(`File not found: ${filename}`)
      process.exit(1)
    }

    try {
      const { frontmatter, body } = parseMdFile(filepath)
      const result = await publishToDevto(
        articleConfig.devto_title,
        body,
        articleConfig.devto_canonical,
        articleConfig.tags
      )

      // Update status in config
      articleConfig.status = 'published'
      articleConfig.devto_id = result.id
      articleConfig.devto_url = result.url
      articleConfig.published_at = new Date().toISOString()

      fs.writeFileSync(
        path.join(__dirname, 'devto-config.json'),
        JSON.stringify(config, null, 2)
      )

      console.log(`\n✅ Article published and config updated!`)
      console.log(`   Dev.to URL: ${result.url}`)
    } catch (err) {
      console.error(`\n❌ Publication failed`)
      process.exit(1)
    }
  } else if (operation === 'schedule') {
    // Show next scheduled articles
    const status = args[1] || 'ready'
    const next = config.articles
      .filter(a => a.status === status)
      .slice(0, config.schedule.articles_per_month)

    console.log(`📅 Next Scheduled Articles (${config.schedule.articles_per_month}/month):\n`)
    for (const article of next) {
      console.log(`• ${article.filename}`)
      console.log(`  "${article.devto_title}"`)
      console.log(`  Scheduled: ${config.schedule.next_publication}\n`)
    }

    console.log(`To publish manually:\n`)
    for (const article of next) {
      console.log(`  node devto-publish.mjs publish ${article.filename}`)
    }
  } else {
    console.log(`Usage:
  node devto-publish.mjs list [status]              # List articles (status: all|published|ready|draft)
  node devto-publish.mjs publish <filename>         # Publish an article to dev.to
  node devto-publish.mjs schedule [status]          # Show next scheduled publications

Examples:
  node devto-publish.mjs list published
  node devto-publish.mjs publish endurance-races-japan-2026.md
  node devto-publish.mjs schedule
`)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
