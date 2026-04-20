#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import matter from 'gray-matter'
import { execSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.join(__dirname, '../../')
const CONTENT_DIR = path.join(__dirname, '../../content/devto')
const DEVTO_API_KEY = process.env.DEVTO_API_KEY

if (!DEVTO_API_KEY) {
  console.error('❌ DEVTO_API_KEY environment variable is not set')
  process.exit(1)
}

function ensureUTMParams(url) {
  if (!url) return undefined
  const utmParams = '?utm_source=devto&utm_medium=article&utm_campaign=devto-organic'
  // Only add UTM if not already present
  if (url.includes('utm_source=')) return url
  // Handle URLs with existing query params
  return url.includes('?') ? `${url}&utm_source=devto&utm_medium=article&utm_campaign=devto-organic` : `${url}${utmParams}`
}

async function publishArticle(filePath, frontmatter, content) {
  const { title, canonical_url, tags, published_at } = frontmatter

  const payload = {
    article: {
      title: title || 'Untitled',
      body_markdown: content,
      canonical_url: ensureUTMParams(canonical_url) || undefined,
      tags: tags || [],
      published: true,
    },
  }

  try {
    const response = await fetch('https://dev.to/api/articles', {
      method: 'POST',
      headers: {
        'api-key': DEVTO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`HTTP ${response.status}: ${error}`)
    }

    const data = await response.json()
    return { success: true, devto_id: data.id, url: data.url }
  } catch (error) {
    throw new Error(`Failed to publish to Dev.to: ${error.message}`)
  }
}

async function updateFrontmatter(filePath, devto_id) {
  const fileContent = fs.readFileSync(filePath, 'utf8')
  const { data, content } = matter(fileContent)

  // Update frontmatter
  data.published = true
  data.devto_id = devto_id

  // Reconstruct file with updated frontmatter
  const updatedContent = matter.stringify(content, data)
  fs.writeFileSync(filePath, updatedContent, 'utf8')
}

function commitPublished(filePath, title) {
  try {
    // Stage the file
    execSync(`git add "${filePath}"`, { cwd: REPO_ROOT })
    // Commit with message
    execSync(`git commit -m "devto: publish ${title}"`, {
      cwd: REPO_ROOT,
    })
    console.log(`✅ Committed: devto: publish ${title}`)
  } catch (error) {
    console.error(`⚠️ Git commit failed: ${error.message}`)
  }
}

async function main() {
  if (!fs.existsSync(CONTENT_DIR)) {
    console.log(`⚠️ Content directory not found: ${CONTENT_DIR}`)
    return
  }

  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.md'))

  if (files.length === 0) {
    console.log('ℹ️ No Markdown files found in content/devto/')
    return
  }

  const today = new Date().toISOString().split('T')[0]
  let errors = []
  let published = []

  for (const file of files) {
    const filePath = path.join(CONTENT_DIR, file)
    const fileContent = fs.readFileSync(filePath, 'utf8')
    const { data: frontmatter, content } = matter(fileContent)

    // Check if should publish
    if (frontmatter.published === true) {
      console.log(`⏭️ Skipped (already published): ${file}`)
      continue
    }

    const publishDate = frontmatter.published_at
      ? new Date(frontmatter.published_at).toISOString().split('T')[0]
      : null

    if (!publishDate || publishDate > today) {
      console.log(
        `⏭️ Skipped (not yet time): ${file} (scheduled: ${publishDate || 'N/A'})`
      )
      continue
    }

    console.log(`🚀 Publishing: ${file}`)

    try {
      const result = await publishArticle(filePath, frontmatter, content)
      console.log(
        `✅ Published to Dev.to: ${frontmatter.title} (ID: ${result.devto_id})`
      )

      // Update frontmatter
      await updateFrontmatter(filePath, result.devto_id)
      console.log(`✅ Updated frontmatter: published=true, devto_id=${result.devto_id}`)

      // Commit
      commitPublished(filePath, frontmatter.title)

      published.push(file)
    } catch (error) {
      console.error(`❌ Error publishing ${file}: ${error.message}`)
      errors.push({ file, error: error.message })
    }
  }

  // Summary
  console.log('\n---')
  console.log(`Published: ${published.length}`)
  console.log(`Failed: ${errors.length}`)

  if (errors.length > 0) {
    console.log('\nFailed articles:')
    errors.forEach(({ file, error }) => {
      console.log(`  - ${file}: ${error}`)
    })
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Fatal error:', error.message)
  process.exit(1)
})
