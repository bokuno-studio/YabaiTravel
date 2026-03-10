import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const schema = import.meta.env.VITE_SUPABASE_SCHEMA ?? 'yabai_travel'

if (!url || !anonKey) {
  throw new Error('VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を設定してください')
}

export const supabase = createClient(url, anonKey, {
  db: {
    schema,
  },
})
