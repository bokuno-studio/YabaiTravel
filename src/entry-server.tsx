import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import type { HelmetServerState } from 'react-helmet-async'
import './i18n-server'
import AppRoutes from './App'

interface RenderResult {
  html: string
  helmet: HelmetServerState
}

export function render(url: string): RenderResult {
  const helmetContext: { helmet?: HelmetServerState } = {}

  const html = renderToString(
    <HelmetProvider context={helmetContext}>
      <StaticRouter location={url}>
        <AppRoutes />
      </StaticRouter>
    </HelmetProvider>,
  )

  return {
    html,
    helmet: helmetContext.helmet!,
  }
}
