/**
 * Blog article loader — reads markdown files from content/blog/ at build time
 * via import.meta.glob and parses YAML frontmatter.
 */

export interface BlogFrontmatter {
  title: string
  description: string
  slug: string
  lang: 'ja' | 'en'
  date: string
  category: 'guide' | 'ops'
}

export interface BlogArticle extends BlogFrontmatter {
  content: string
  /** original filename without extension */
  filename: string
}

// Import all markdown files at build time as raw strings
const modules = import.meta.glob('/content/blog/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

/** Parse YAML frontmatter from markdown string */
function parseFrontmatter(raw: string): { meta: Record<string, string>; content: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) return { meta: {}, content: raw }

  const meta: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*"?([^"]*)"?\s*$/)
    if (kv) meta[kv[1]] = kv[2]
  }
  return { meta, content: match[2] }
}

/** Load and parse all blog articles */
function loadArticles(): BlogArticle[] {
  const articles: BlogArticle[] = []

  for (const [filepath, raw] of Object.entries(modules)) {
    const filename = filepath.split('/').pop()?.replace(/\.md$/, '') ?? ''
    const { meta, content } = parseFrontmatter(raw)

    if (!meta.title || !meta.slug || !meta.lang) continue

    articles.push({
      title: meta.title,
      description: meta.description ?? '',
      slug: meta.slug,
      lang: meta.lang as 'ja' | 'en',
      date: meta.date ?? '',
      category: (meta.category as 'guide' | 'ops') ?? 'guide',
      content,
      filename,
    })
  }

  // Sort by date descending
  articles.sort((a, b) => b.date.localeCompare(a.date))
  return articles
}

let _cache: BlogArticle[] | null = null

/** Get all blog articles (cached) */
export function getAllArticles(): BlogArticle[] {
  if (!_cache) _cache = loadArticles()
  return _cache
}

/** Get articles filtered by language */
export function getArticlesByLang(lang: string): BlogArticle[] {
  return getAllArticles().filter((a) => a.lang === lang)
}

/** Get a single article by slug and language */
export function getArticle(slug: string, lang: string): BlogArticle | undefined {
  return getAllArticles().find((a) => a.slug === slug && a.lang === lang)
}

/** Check if an alternate language version exists for a given slug */
export function getAlternateLang(slug: string, lang: string): string | null {
  const altLang = lang === 'ja' ? 'en' : 'ja'
  const alt = getAllArticles().find((a) => a.slug === slug && a.lang === altLang)
  return alt ? altLang : null
}
