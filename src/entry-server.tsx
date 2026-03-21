import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import ErrorBoundary from './components/ErrorBoundary'
import './i18n-server'
import AppRoutes from './App'

interface RenderResult {
  html: string
}

export function render(url: string): RenderResult {
  // AuthProvider は useEffect 内でのみ Supabase を呼ぶため SSR でも安全。
  // SSR 時は user=null, loading=true のデフォルト状態でレンダリングされる。
  const html = renderToString(
    <ErrorBoundary>
      <AuthProvider>
        <StaticRouter location={url}>
          <AppRoutes />
        </StaticRouter>
      </AuthProvider>
    </ErrorBoundary>,
  )

  return { html }
}
