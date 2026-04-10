import path from 'path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ isSsrBuild }) => ({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: isSsrBuild ? { inlineDynamicImports: true } : {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-ui': ['lucide-react', 'class-variance-authority', 'clsx', 'tailwind-merge'],
          'vendor-i18n': ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
          // Note: Google Maps libraries (@vis.gl/react-google-maps, @react-google-maps/api)
          // are intentionally NOT in manualChunks. Listing them here forces modulepreload
          // on the entry HTML even though EventMap is lazy-loaded, which loads ~176KB on
          // every page. Leaving them out lets Vite emit them as async chunks that are
          // only fetched when EventMap actually mounts.
          'vendor-sentry': ['@sentry/react'],
        },
      },
    },
  },
  ssr: {},
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    exclude: ['e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.{ts,tsx}', 'api/**/*.ts'],
      exclude: ['src/**/*.test.*', 'src/test/**', 'src/components/ui/**'],
    },
  },
}))
