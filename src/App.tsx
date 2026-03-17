import { BrowserRouter, Routes, Route, Navigate, Outlet, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEffect } from 'react'
import EventList from './pages/EventList'
import EventDetail from './pages/EventDetail'
import CategoryDetail from './pages/CategoryDetail'
import Sources from './pages/Sources'
import SportGuide from './pages/SportGuide'
import SideMenu from './components/SideMenu'

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
    <>
      <SideMenu />
      <Outlet />
    </>
  )
}

/** ブラウザ言語でリダイレクト */
function DefaultRedirect() {
  const browserLang = navigator.language.startsWith('ja') ? 'ja' : 'en'
  return <Navigate to={`/${browserLang}`} replace />
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/:lang" element={<LangLayout />}>
          <Route index element={<EventList />} />
          <Route path="events/:eventId" element={<EventDetail />} />
          <Route path="events/:eventId/categories/:categoryId" element={<CategoryDetail />} />
          <Route path="sources" element={<Sources />} />
          <Route path="guide/:sport" element={<SportGuide />} />
        </Route>
        <Route path="/" element={<DefaultRedirect />} />
        {/* 旧URL互換 */}
        <Route path="/events/:eventId/categories/:categoryId" element={<Navigate to={`/ja${window.location.pathname}`} replace />} />
        <Route path="/events/:eventId" element={<Navigate to={`/ja${window.location.pathname}`} replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
