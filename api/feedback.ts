import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'yabai_travel' } }
)

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
    const { type, status, limit, offset } = req.query

    let query = supabase
      .from('feedbacks')
      .select('*')
      .order('created_at', { ascending: false })

    if (type && typeof type === 'string') {
      query = query.eq('feedback_type', type)
    }

    if (status && typeof status === 'string') {
      query = query.eq('status', status)
    }

    const queryLimit = limit ? parseInt(String(limit), 10) : 50
    const queryOffset = offset ? parseInt(String(offset), 10) : 0
    query = query.range(queryOffset, queryOffset + queryLimit - 1)

    const { data, error } = await query

    if (error) {
      console.error('Failed to fetch feedbacks:', error)
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
    const { content, feedback_type, source_url, user_id, channel } = req.body || {}

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'content is required' })
    }

    const feedbackType = feedback_type === 'bug' ? 'bug' : 'feature'

    const { data, error } = await supabase
      .from('feedbacks')
      .insert({
        content: content.trim(),
        feedback_type: feedbackType,
        source_url: source_url || null,
        user_id: user_id || null,
        channel: channel || 'web',
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to insert feedback:', error)
      return res.status(500).json({ error: error.message })
    }

    return res.status(201).json({ data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: message })
  }
}
