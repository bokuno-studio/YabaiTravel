import { useParams, Link, Navigate } from 'react-router-dom'
import { getArticle, getAlternateLang } from '../lib/blog'
import { blogPostToJsonLd } from '../lib/jsonld'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Calendar } from 'lucide-react'
import { LazyMarkdown } from '@/components/LazyMarkdown'

/** Convert absolute yabai.travel links to relative paths */
function rewriteLinks(content: string): string {
  return content.replace(/https?:\/\/yabai\.travel/g, '')
}

function BlogPost() {
  const { slug, lang } = useParams<{ slug: string; lang: string }>()
  const isEn = lang === 'en'
  const langPrefix = `/${lang || 'ja'}`

  const article = getArticle(slug ?? '', lang ?? 'ja')

  if (!article) {
    return <Navigate to={`${langPrefix}/blog`} replace />
  }

  const canonicalUrl = `https://yabai.travel/${article.lang}/blog/${article.slug}`
  const altLang = getAlternateLang(article.slug, article.lang)
  const jaUrl = `https://yabai.travel/ja/blog/${article.slug}`
  const enUrl = `https://yabai.travel/en/blog/${article.slug}`

  const markdownContent = rewriteLinks(article.content)

  return (
    <>
      <title>{`${article.title} | yabai.travel`}</title>
      <meta name="description" content={article.description} />
      <meta property="og:title" content={`${article.title} | yabai.travel`} />
      <meta property="og:description" content={article.description} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:type" content="article" />
      <link rel="canonical" href={canonicalUrl} />
      {altLang ? (
        <>
          <link rel="alternate" hrefLang="ja" href={jaUrl} />
          <link rel="alternate" hrefLang="en" href={enUrl} />
          <link rel="alternate" hrefLang="x-default" href={enUrl} />
        </>
      ) : (
        <link rel="alternate" hrefLang={article.lang} href={canonicalUrl} />
      )}
      <script type="application/ld+json">
        {JSON.stringify(blogPostToJsonLd(article, canonicalUrl))}
      </script>

      <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
        {/* Breadcrumb */}
        <div className="mb-6">
          <Link
            to={`${langPrefix}/blog`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            {isEn ? 'Back to Blog' : 'ブログ一覧に戻る'}
          </Link>
        </div>

        {/* Article header */}
        <header className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {article.category === 'ops'
                ? (isEn ? 'AI Ops' : 'AI運営')
                : (isEn ? 'Guide' : 'ガイド')}
            </Badge>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {article.date}
            </span>
          </div>
          <h1 className="text-2xl font-bold leading-tight md:text-3xl">{article.title}</h1>
          {altLang && (
            <Link
              to={`/${altLang}/blog/${article.slug}`}
              className="mt-3 inline-block text-sm text-primary hover:underline"
            >
              {altLang === 'en' ? 'Read in English' : '日本語で読む'}
            </Link>
          )}
        </header>

        {/* Markdown content */}
        <article className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-bold prose-headings:tracking-tight prose-h2:mt-8 prose-h2:mb-4 prose-h2:text-xl prose-h3:mt-6 prose-h3:mb-3 prose-h3:text-lg prose-p:leading-relaxed prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-img:rounded-lg prose-table:text-sm prose-th:text-left prose-strong:font-semibold">
          <LazyMarkdown content={markdownContent} />
        </article>

        {/* Back to blog link */}
        <div className="mt-12 border-t border-border pt-6">
          <Link
            to={`${langPrefix}/blog`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            {isEn ? 'Back to Blog' : 'ブログ一覧に戻る'}
          </Link>
        </div>
      </div>
    </>
  )
}

export default BlogPost
