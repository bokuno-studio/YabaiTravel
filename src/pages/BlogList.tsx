import { useState } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getArticlesByLang } from '../lib/blog'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Calendar } from 'lucide-react'

type CategoryFilter = 'all' | 'guide' | 'ops'

function BlogList() {
  const { lang } = useParams<{ lang: string }>()
  const location = useLocation()
  const { t } = useTranslation()
  const isEn = lang === 'en'
  const langPrefix = `/${lang || 'ja'}`
  const [filter, setFilter] = useState<CategoryFilter>('all')

  const articles = getArticlesByLang(lang || 'ja')
  const filtered = filter === 'all' ? articles : articles.filter((a) => a.category === filter)

  const categoryLabels: Record<CategoryFilter, string> = {
    all: isEn ? 'All' : 'すべて',
    guide: isEn ? 'Guide' : 'ガイド',
    ops: isEn ? 'AI Ops' : 'AI運営',
  }

  const hasOps = articles.some((a) => a.category === 'ops')

  return (
    <>
      <title>{`${isEn ? 'Blog' : 'ブログ'} | yabai.travel`}</title>
      <meta
        name="description"
        content={
          isEn
            ? 'Endurance racing tips, guides, and stories from yabai.travel'
            : 'エンデュランスレースのガイド・ヒント・ストーリー'
        }
      />
      <meta property="og:title" content={`${isEn ? 'Blog' : 'ブログ'} | yabai.travel`} />
      <meta
        property="og:description"
        content={
          isEn
            ? 'Endurance racing tips, guides, and stories from yabai.travel'
            : 'エンデュランスレースのガイド・ヒント・ストーリー'
        }
      />
      <meta property="og:url" content={`https://yabai.travel${location.pathname}`} />
      <link rel="canonical" href={`https://yabai.travel${location.pathname}`} />
      <link rel="alternate" hrefLang="ja" href="https://yabai.travel/ja/blog" />
      <link rel="alternate" hrefLang="en" href="https://yabai.travel/en/blog" />
      <link rel="alternate" hrefLang="x-default" href="https://yabai.travel/en/blog" />

      <div className="mx-auto max-w-4xl px-4 py-6 md:px-6">
        {/* Breadcrumb */}
        <div className="mb-6">
          <Link
            to={langPrefix}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('detail.backToList')}
          </Link>
        </div>

        {/* Header */}
        <h1 className="mb-2 text-2xl font-bold">{isEn ? 'Blog' : 'ブログ'}</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {isEn
            ? 'Endurance racing tips, guides, and stories'
            : 'エンデュランスレースのガイド・ヒント・ストーリー'}
        </p>

        {/* Category filter */}
        <div className="mb-6 flex gap-2">
          {(Object.keys(categoryLabels) as CategoryFilter[])
            .filter((k) => k !== 'ops' || hasOps)
            .map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  filter === key
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/50'
                }`}
              >
                {categoryLabels[key]}
              </button>
            ))}
        </div>

        {/* Articles grid */}
        <div className="grid gap-4">
          {filtered.map((article) => (
            <Link
              key={article.filename}
              to={`${langPrefix}/blog/${article.slug}`}
              className="no-underline"
            >
              <Card className="transition-colors hover:border-primary/50">
                <CardContent className="p-5">
                  <div className="mb-2 flex items-center gap-2">
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
                  <h2 className="mb-1 text-lg font-semibold text-foreground">{article.title}</h2>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {article.description}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {filtered.length === 0 && (
          <p className="py-12 text-center text-muted-foreground">
            {isEn ? 'No articles found.' : '記事が見つかりません。'}
          </p>
        )}
      </div>
    </>
  )
}

export default BlogList
