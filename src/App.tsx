import { Routes, Route, Navigate, Outlet, useParams, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { lazy, Suspense, useEffect } from 'react'
import { trackPageView } from './lib/analytics'
import SideMenu from './components/SideMenu'
import FeedbackWidget from './components/FeedbackWidget'
import LoadingSpinner from './components/LoadingSpinner'
import { SidebarFilterProvider } from './contexts/SidebarFilterContext'
import { SidebarStatsProvider } from './contexts/SidebarStatsContext'

/** Retry dynamic import once, then force reload to bust stale chunks */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lazyWithRetry(importFn: () => Promise<{ default: any }>) {
  return lazy(() =>
    importFn().catch(() => {
      window.location.reload()
      return { default: () => null }
    }),
  )
}

const EventList = lazyWithRetry(() => import('./pages/EventList'))
const EventDetail = lazyWithRetry(() => import('./pages/EventDetail'))
const CategoryDetail = lazyWithRetry(() => import('./pages/CategoryDetail'))
const Sources = lazyWithRetry(() => import('./pages/Sources'))
const SportGuide = lazyWithRetry(() => import('./pages/SportGuide'))
const Pricing = lazyWithRetry(() => import('./pages/Pricing'))
const Legal = lazyWithRetry(() => import('./pages/Legal'))
const Feedback = lazyWithRetry(() => import('./pages/Feedback'))
const PaymentSuccess = lazyWithRetry(() => import('./pages/PaymentSuccess'))
const PaymentCancel = lazyWithRetry(() => import('./pages/PaymentCancel'))
const BlogList = lazyWithRetry(() => import('./pages/BlogList'))
const BlogPost = lazyWithRetry(() => import('./pages/BlogPost'))

/** パスの :lang から i18n 言語を設定し、子ルートを描画 */
function LangLayout() {
  const { lang } = useParams<{ lang: string }>()
  const { i18n } = useTranslation()

  useEffect(() => {
    if ((lang === 'en' || lang === 'ja') && i18n.language !== lang) {
      i18n.changeLanguage(lang)
    }
    if (lang === 'en' || lang === 'ja') {
      document.documentElement.lang = lang
    }
  }, [lang, i18n])

  if (lang !== 'ja' && lang !== 'en') {
    return <Navigate to="/ja" replace />
  }

  return (
    <SidebarFilterProvider>
      <SidebarStatsProvider>
        <SideMenu />
        <div className="min-[960px]:ml-60 min-[960px]:pl-6">
          <Suspense fallback={<LoadingSpinner />}>
            <Outlet />
          </Suspense>
        </div>
        <FeedbackWidget />
      </SidebarStatsProvider>
    </SidebarFilterProvider>
  )
}

/** ブラウザ言語でリダイレクト（SSR 時は /ja にフォールバック） */
function DefaultRedirect() {
  const browserLang =
    typeof navigator !== 'undefined' && navigator.language.startsWith('ja')
      ? 'ja'
      : typeof navigator !== 'undefined'
        ? 'en'
        : 'ja'
  return <Navigate to={`/${browserLang}`} replace />
}

/** 旧URL互換リダイレクト（useLocation で SSR 安全に pathname を取得） */
function LegacyRedirect() {
  const location = useLocation()
  return <Navigate to={`/ja${location.pathname}`} replace />
}

/** ルート定義（BrowserRouter / StaticRouter の中で使う） */
function AppRoutes() {
  const location = useLocation()

  useEffect(() => {
    trackPageView(location.pathname + location.search)
  }, [location.pathname, location.search])

  return (
    <Routes>
      <Route path="/:lang" element={<LangLayout />}>
        <Route index element={<EventList />} />
        <Route path="events/:eventId" element={<EventDetail />} />
        <Route path="events/:eventId/categories/:categoryId" element={<CategoryDetail />} />
        <Route path="sources" element={<Sources />} />
        <Route path="guide/:sport" element={<SportGuide />} />
        <Route path="feedback" element={<Feedback />} />
        <Route path="pricing" element={<Pricing />} />
        <Route path="legal" element={<Legal />} />
        <Route path="blog" element={<BlogList />} />
        <Route path="blog/:slug" element={<BlogPost />} />
        <Route path="payment/success" element={<PaymentSuccess />} />
        <Route path="payment/cancel" element={<PaymentCancel />} />
      </Route>
      <Route path="/" element={<DefaultRedirect />} />
      {/* 旧URL互換 */}
      <Route path="/events/:eventId/categories/:categoryId" element={<LegacyRedirect />} />
      <Route path="/events/:eventId" element={<LegacyRedirect />} />
    </Routes>
  )
}

export { AppRoutes }
export default AppRoutes
