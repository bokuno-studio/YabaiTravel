import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を設定してください')
}

// public.events ビュー経由で参照（yabai_travel は DB 内で保持、API は public 経由）
export const supabase = createClient(url, anonKey)
