import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import './i18n-server'
import AppRoutes from './App'

interface RenderResult {
  html: string
}

export function render(url: string): RenderResult {
  const html = renderToString(
    <StaticRouter location={url}>
      <AppRoutes />
    </StaticRouter>,
  )

  return { html }
}
