/**
 * SSR サーバー（ローカル開発用 + Vercel serverless function からの共通ロジック）
 *
 * ローカル確認: node server.js
 * Vercel: api/ssr.js から render() を import して使う
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * SSR レンダリングを実行して完成 HTML を返す
 * @param {string} url - リクエスト URL パス（例: /ja, /ja/events/123）
 * @returns {Promise<string>} レンダリング済み HTML
 */
export async function renderPage(url) {
  // クライアントビルド済みの index.html をテンプレートとして読み込み
  const templatePath = path.resolve(__dirname, 'dist/index.html')
  let template = fs.readFileSync(templatePath, 'utf-8')

  // SSR バンドルを読み込み
  const { render } = await import('./dist/server/entry-server.js')

  const { html: appHtml } = render(url)

  // <!--ssr-outlet--> をアプリ HTML で置換
  const finalHtml = template.replace('<!--ssr-outlet-->', appHtml)

  return finalHtml
}

// ローカル確認用: node server.js で起動
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  const { default: express } = await import('express')
  const app = express()

  // 静的アセットを配信
  app.use('/assets', express.static(path.resolve(__dirname, 'dist/assets')))
  app.use(express.static(path.resolve(__dirname, 'dist'), { index: false }))

  // すべてのリクエストを SSR で処理
  app.get('*', async (req, res) => {
    try {
      const html = await renderPage(req.originalUrl)
      res.status(200).set({ 'Content-Type': 'text/html' }).end(html)
    } catch (e) {
      console.error('SSR Error:', e)
      res.status(500).end('Internal Server Error')
    }
  })

  const port = process.env.PORT || 3000
  app.listen(port, () => {
    console.log(`SSR server running at http://localhost:${port}`)
  })
}
