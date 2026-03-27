import { renderToString } from 'react-dom/server'
import { StaticRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import ErrorBoundary from './components/ErrorBoundary'
import './i18n-server'

// SSR: 直接インポート（React.lazy は renderToString で解決できない）
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
import { SidebarFilterProvider } from './contexts/SidebarFilterContext'
import { SidebarStatsProvider } from './contexts/SidebarStatsContext'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEffect } from 'react'

// eslint-disable-next-line react-refresh/only-export-components
function SsrLangLayout() {
  const { lang } = useParams<{ lang: string }>()
  const { i18n } = useTranslation()
  useEffect(() => {
    if ((lang === 'en' || lang === 'ja') && i18n.language !== lang) {
      i18n.changeLanguage(lang)
    }
  }, [lang, i18n])
  if (lang !== 'ja' && lang !== 'en') return <Navigate to="/ja" replace />

  return (
    <SidebarFilterProvider>
      <SidebarStatsProvider>
        <SideMenu />
        <div className="min-[960px]:ml-60 min-[960px]:pl-6">
          <Outlet />
        </div>
      </SidebarStatsProvider>
    </SidebarFilterProvider>
  )
}

// This is intentionally not used as a layout with Outlet because
// SSR renderToString doesn't support Outlet well with direct imports.
// Instead we render the full route tree.

// eslint-disable-next-line react-refresh/only-export-components
function SsrRoutes() {
  return (
    <Routes>
      <Route path="/:lang" element={<SsrLangLayout />}>
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
      <Route path="/" element={<Navigate to="/ja" replace />} />
    </Routes>
  )
}

interface RenderResult {
  html: string
}

export function render(url: string): RenderResult {
  const html = renderToString(
    <ErrorBoundary>
      <AuthProvider>
        <StaticRouter location={url}>
          <SsrRoutes />
        </StaticRouter>
      </AuthProvider>
    </ErrorBoundary>,
  )

  return { html }
}
