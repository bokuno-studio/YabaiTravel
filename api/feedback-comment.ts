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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    return handleGet(req, res)
  }
  if (req.method === 'POST') {
    return handlePost(req, res)
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ error: 'Method not allowed' })
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  try {
    const { feedback_id } = req.query

    if (!feedback_id || typeof feedback_id !== 'string') {
      return res.status(400).json({ error: 'feedback_id query parameter is required' })
    }

    const { data, error } = await supabaseAdmin
      .from('feedback_comments')
      .select('*')
      .eq('feedback_id', feedback_id)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Failed to fetch comments:', error)
      return res.status(500).json({ error: error.message })
    }

    return res.status(200).json({ data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: message })
  }
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  try {
    // Extract JWT from Authorization header
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const token = authHeader.replace('Bearer ', '')

    // Verify the JWT and get the user
    const supabaseUser = createUserClient(token)
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    const { feedback_id, content } = req.body || {}

    if (!feedback_id) {
      return res.status(400).json({ error: 'feedback_id is required' })
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'content is required' })
    }

    // Insert comment using admin client (bypasses RLS for service role)
    const { data, error } = await supabaseAdmin
      .from('feedback_comments')
      .insert({
        feedback_id,
        user_id: user.id,
        content: content.trim(),
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to insert comment:', error)
      return res.status(500).json({ error: error.message })
    }

    return res.status(201).json({ data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: message })
  }
}
