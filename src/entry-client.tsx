import { StrictMode } from 'react'
import { hydrateRoot, createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import './index.css'
import './i18n'
import AppRoutes from './App'

const container = document.getElementById('root')!

// SSR でレンダリング済みの HTML があれば hydrate、なければ通常の createRoot
if (container.innerHTML.trim().length > 0) {
  hydrateRoot(
    container,
    <StrictMode>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </StrictMode>,
  )
} else {
  createRoot(container).render(
    <StrictMode>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </StrictMode>,
  )
}
