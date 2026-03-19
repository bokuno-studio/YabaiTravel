import { Routes, Route, Navigate, Outlet, useParams, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEffect } from 'react'
import EventList from './pages/EventList'
import EventDetail from './pages/EventDetail'
import CategoryDetail from './pages/CategoryDetail'
import Sources from './pages/Sources'
import SportGuide from './pages/SportGuide'
import Pricing from './pages/Pricing'
import Legal from './pages/Legal'
import Feedback from './pages/Feedback'
import PaymentSuccess from './pages/PaymentSuccess'
import PaymentCancel from './pages/PaymentCancel'
import SideMenu from './components/SideMenu'
import FeedbackWidget from './components/FeedbackWidget'
import { SidebarFilterProvider } from './contexts/SidebarFilterContext'
import { SidebarStatsProvider } from './contexts/SidebarStatsContext'

/** パスの :lang から i18n 言語を設定し、子ルートを描画 */
function LangLayout() {
  const { lang } = useParams<{ lang: string }>()
  const { i18n } = useTranslation()

  useEffect(() => {
    if ((lang === 'en' || lang === 'ja') && i18n.language !== lang) {
      i18n.changeLanguage(lang)
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
          <Outlet />
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
