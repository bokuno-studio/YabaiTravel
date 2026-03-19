import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL ?? ''
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
const schema = import.meta.env.VITE_SUPABASE_SCHEMA ?? 'yabai_travel'

if (!url || !anonKey) {
  // SSR ビルド時は環境変数が未設定の場合がある。
  // useEffect 内でのみ supabase を使用するため、SSR レンダリング自体には影響しない。
  if (typeof window !== 'undefined') {
    throw new Error('VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を設定してください')
  }
  console.warn('Supabase credentials not found (SSR mode - data fetching will be skipped)')
}

export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder', {
  db: {
    schema,
  },
})
