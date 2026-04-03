import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')
const ENV_PATH = path.join(PROJECT_ROOT, '.env.local')
const CONTENT_DIR = '/Volumes/Extreme SSD/ops/yabai-travel/content/blog/publish/devto'
const DEVTO_API_BASE = 'https://dev.to/api'

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) {
    throw new Error(`.env.local not found: ${envPath}`)
  }

  const env = {}
  const content = fs.readFileSync(envPath, 'utf8')

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const separatorIndex = line.indexOf('=')
    if (separatorIndex === -1) continue

    const key = line.slice(0, separatorIndex).trim()
    let value = line.slice(separatorIndex + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    env[key] = value
  }

  return env
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return []
  return tags
    .map((tag) => String(tag).trim().toLowerCase().replace(/\s+/g, ''))
    .filter(Boolean)
    .slice(0, 4)
}

function serializeFrontmatter(data) {
  return Object.entries(data)
    .map(([key, value]) => {
      if (Array.isArray(value)) return `${key}: [${value.join(', ')}]`
      if (typeof value === 'string') return `${key}: ${JSON.stringify(value)}`
      if (value instanceof Date) return `${key}: ${value.toISOString().slice(0, 10)}`
      return `${key}: ${String(value)}`
    })
    .join('\n')
}

function updateMarkdownFrontmatter(filePath, body, data) {
  const nextContent = `---\n${serializeFrontmatter(data)}\n---\n\n${body.trimStart()}`
  fs.writeFileSync(filePath, `${nextContent}\n`, 'utf8')
}

async function publishArticle(apiKey, articlePath) {
  const raw = fs.readFileSync(articlePath, 'utf8')
  const parsed = matter(raw)
  const body = parsed.content.trim()
  const frontmatter = { ...parsed.data }

  if (frontmatter.published !== true) {
    return { status: 'skipped', title: frontmatter.title ?? path.basename(articlePath) }
  }

  if (!frontmatter.title) throw new Error(`Missing title in ${articlePath}`)
  if (!frontmatter.canonical_url) throw new Error(`Missing canonical_url in ${articlePath}`)

  const payload = {
    article: {
      title: frontmatter.title,
      published: true,
      body_markdown: body,
      tags: normalizeTags(frontmatter.tags),
      canonical_url: frontmatter.canonical_url,
      series: frontmatter.series ?? null,
    },
  }

  const devtoId = frontmatter.devto_id ? Number(frontmatter.devto_id) : null
  const endpoint = devtoId
    ? `${DEVTO_API_BASE}/articles/${devtoId}`
    : `${DEVTO_API_BASE}/articles`
  const method = devtoId ? 'PUT' : 'POST'

  const response = await fetch(endpoint, {
    method,
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`${method} ${endpoint} failed: ${response.status} ${errorText}`)
  }

  const result = await response.json()
  frontmatter.devto_id = result.id
  frontmatter.devto_url = result.url
  updateMarkdownFrontmatter(articlePath, body, frontmatter)

  return {
    status: devtoId ? 'updated' : 'created',
    title: frontmatter.title,
    url: result.url,
  }
}

async function main() {
  const env = loadEnvFile(ENV_PATH)
  const apiKey = env.DEVTO_API_KEY

  if (!apiKey) throw new Error('DEVTO_API_KEY is missing in .env.local')
  if (!fs.existsSync(CONTENT_DIR)) throw new Error(`Content directory not found: ${CONTENT_DIR}`)

  const files = fs.readdirSync(CONTENT_DIR).filter((name) => name.endsWith('.md')).sort()
  const results = []

  for (const fileName of files) {
    const articlePath = path.join(CONTENT_DIR, fileName)
    const result = await publishArticle(apiKey, articlePath)
    results.push(result)

    if (result.status === 'skipped') {
      console.log(`[skip] ${result.title}`)
      continue
    }

    console.log(`[${result.status}] ${result.title}`)
    console.log(result.url)
  }

  const publishedResults = results.filter((result) => result.status !== 'skipped')
  console.log(`Processed ${results.length} file(s); published ${publishedResults.length}.`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
