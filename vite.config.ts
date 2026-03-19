import path from 'path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // SSR ビルド時は server.ts を別途 vite build --ssr で処理するため
    // クライアントビルドのデフォルト出力先は dist/client
    outDir: 'dist/client',
  },
  ssr: {
    // SSR ビルドで外部化しないモジュール（CSS 等は Vite がバンドルする必要がある）
    noExternal: ['react-helmet-async'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
