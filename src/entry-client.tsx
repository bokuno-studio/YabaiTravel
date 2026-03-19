import { StrictMode } from 'react'
import { hydrateRoot, createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import './index.css'
import './i18n'
import AppRoutes from './App'

const container = document.getElementById('root')!

// SSR でレンダリング済みの HTML があれば hydrate、なければ通常の createRoot
if (container.innerHTML.trim().length > 0) {
  hydrateRoot(
    container,
    <StrictMode>
      <HelmetProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </HelmetProvider>
    </StrictMode>,
  )
} else {
  createRoot(container).render(
    <StrictMode>
      <HelmetProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </HelmetProvider>
    </StrictMode>,
  )
}
