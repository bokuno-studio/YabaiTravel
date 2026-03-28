/**
 * sitemap.xml 生成スクリプト
 * ビルド前に実行し、public/sitemap.xml を生成する
 *
 * 使い方: node scripts/generate-sitemap.js
 */
import pg from 'pg'
import fs, { existsSync, readFileSync } from 'fs'
import path, { resolve } from 'path'
import { fileURLToPath } from 'url'

// .env.local 読み込み（ローカル実行用）
const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  })
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCHEMA = process.env.VITE_SUPABASE_SCHEMA || 'yabai_travel'
const BASE_URL = 'https://yabai.travel'
const LANGS = ['ja', 'en']

async function generateSitemap() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })

  let urls = []

  // 静的ページ
  for (const lang of LANGS) {
    urls.push({
      loc: `${BASE_URL}/${lang}`,
      changefreq: 'daily',
      priority: '1.0',
      alternates: LANGS.map(l => ({ lang: l, href: `${BASE_URL}/${l}` }))
    })
  }

  // ブログ一覧ページ
  for (const lang of LANGS) {
    urls.push({
      loc: `${BASE_URL}/${lang}/blog`,
      changefreq: 'weekly',
      priority: '0.7',
      alternates: LANGS.map(l => ({ lang: l, href: `${BASE_URL}/${l}/blog` }))
    })
  }

  // ブログ記事ページ（content/blog/*.md のfrontmatterから読み取り）
  const blogDir = path.join(__dirname, '..', 'content', 'blog')
  if (existsSync(blogDir)) {
    const blogFiles = fs.readdirSync(blogDir).filter(f => f.endsWith('.md'))
    const blogPosts = []
    for (const file of blogFiles) {
      const raw = readFileSync(path.join(blogDir, file), 'utf8')
      const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
      if (!fmMatch) continue
      const meta = {}
      for (const line of fmMatch[1].split('\n')) {
        const kv = line.match(/^(\w+):\s*"?([^"]*)"?\s*$/)
        if (kv) meta[kv[1]] = kv[2]
      }
      if (meta.slug && meta.lang) blogPosts.push(meta)
    }

    // Group by slug to detect JA/EN pairs
    const slugMap = {}
    for (const post of blogPosts) {
      if (!slugMap[post.slug]) slugMap[post.slug] = {}
      slugMap[post.slug][post.lang] = post
    }

    for (const [slug, langVersions] of Object.entries(slugMap)) {
      const availableLangs = Object.keys(langVersions)
      for (const lang of availableLangs) {
        const post = langVersions[lang]
        urls.push({
          loc: `${BASE_URL}/${lang}/blog/${slug}`,
          lastmod: post.date,
          changefreq: 'monthly',
          priority: '0.7',
          alternates: availableLangs.map(l => ({ lang: l, href: `${BASE_URL}/${l}/blog/${slug}` }))
        })
      }
    }
    console.log(`sitemap: ${blogPosts.length}件のブログ記事を追加`)
  }

  // DBからイベント・カテゴリを取得できる場合
  try {
    await client.connect()

    const { rows: events } = await client.query(
      `SELECT id, updated_at FROM ${SCHEMA}.events WHERE collected_at IS NOT NULL ORDER BY updated_at DESC`
    )

    for (const event of events) {
      const lastmod = event.updated_at instanceof Date ? event.updated_at.toISOString().slice(0, 10) : event.updated_at?.slice(0, 10)
      for (const lang of LANGS) {
        urls.push({
          loc: `${BASE_URL}/${lang}/events/${event.id}`,
          lastmod,
          changefreq: 'weekly',
          priority: '0.8',
          alternates: LANGS.map(l => ({ lang: l, href: `${BASE_URL}/${l}/events/${event.id}` }))
        })
      }
    }

    const { rows: categories } = await client.query(
      `SELECT c.id, c.event_id, c.updated_at FROM ${SCHEMA}.categories c
       JOIN ${SCHEMA}.events e ON e.id = c.event_id
       WHERE e.collected_at IS NOT NULL AND c.collected_at IS NOT NULL
       ORDER BY c.updated_at DESC`
    )

    for (const cat of categories) {
      const lastmod = cat.updated_at instanceof Date ? cat.updated_at.toISOString().slice(0, 10) : cat.updated_at?.slice(0, 10)
      for (const lang of LANGS) {
        urls.push({
          loc: `${BASE_URL}/${lang}/events/${cat.event_id}/categories/${cat.id}`,
          lastmod,
          changefreq: 'weekly',
          priority: '0.7',
          alternates: LANGS.map(l => ({ lang: l, href: `${BASE_URL}/${l}/events/${cat.event_id}/categories/${cat.id}` }))
        })
      }
    }

    await client.end()
    console.log(`sitemap: ${events.length}件のイベント、${categories.length}件のカテゴリを追加`)
  } catch (e) {
    console.warn('DB接続失敗 - 静的ページのみのsitemapを生成します:', e.message)
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
    ${(u.alternates || []).map(a => `<xhtml:link rel="alternate" hreflang="${a.lang}" href="${a.href}"/>`).join('\n    ')}
  </url>`).join('\n')}
</urlset>`

  const outPath = path.join(__dirname, '..', 'public', 'sitemap.xml')
  fs.writeFileSync(outPath, xml, 'utf-8')
  console.log(`✅ sitemap.xml を生成しました: ${urls.length} URLs`)
}

generateSitemap().catch(e => { console.error(e); process.exit(1) })
