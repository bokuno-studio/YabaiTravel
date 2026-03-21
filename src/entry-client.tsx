import { StrictMode } from 'react'
import { hydrateRoot, createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import { initSentry } from './lib/sentry'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'
import './i18n'
import AppRoutes from './App'

initSentry()

const rootElement = document.getElementById('root')!
const app = (
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>
)

// SSR で既にレンダリング済みの HTML がある場合は hydrateRoot を使う
// そうでなければ createRoot（開発モード or SPA フォールバック）
if (rootElement.innerHTML.trim()) {
  hydrateRoot(rootElement, app)
} else {
  createRoot(rootElement).render(app)
}
