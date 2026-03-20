import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'yabai_travel' } }
)

function createUserClient(accessToken: string) {
  return createClient(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY!,
    {
      db: { schema: 'yabai_travel' },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    }
  )
}

