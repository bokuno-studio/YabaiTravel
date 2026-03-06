/**
 * Supabase の yabai_travel.events が API から参照できるか確認
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY が未設定')
  process.exit(1)
}

const supabase = createClient(url, key, { db: { schema: 'yabai_travel' } })

const { data, error } = await supabase.from('events').select('id, name').limit(3)

if (error) {
  console.error('❌ エラー:', error.message)
  process.exit(1)
}

console.log('✅ 成功: yabai_travel.events から', data?.length ?? 0, '件取得')
data?.forEach((r) => console.log('  -', r.name))
