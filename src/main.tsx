// このファイルは後方互換用。Vite dev サーバーおよび非 SSR ビルドで使用される。
// SSR ビルドでは entry-client.tsx がエントリポイントとなる。
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import './index.css'
import './i18n'
import AppRoutes from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
)
