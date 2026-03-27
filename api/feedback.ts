import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'yabai_travel' } }
)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleGet(req, res)
  if (req.method === 'POST') return handlePost(req, res)
  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ error: 'Method not allowed' })
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  try {
    const { type, status, limit, offset } = req.query
    let query = supabase.from('feedbacks').select('*').order('created_at', { ascending: false })
    if (type && typeof type === 'string') query = query.eq('feedback_type', type)
    if (status && typeof status === 'string') query = query.eq('status', status)
    const queryLimit = limit ? parseInt(String(limit), 10) : 50
    const queryOffset = offset ? parseInt(String(offset), 10) : 0
    query = query.range(queryOffset, queryOffset + queryLimit - 1)
    const { data, error } = await query
    if (error) return res.status(500).json({ error: 'Internal server error' })
    return res.status(200).json({ data })
  } catch {
    return res.status(500).json({ error: 'Internal server error' })
  }
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  try {
    const { content, feedback_type, source_url, channel, user_id } = req.body || {}
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'content is required' })
    }
    if (!['bug', 'feature'].includes(feedback_type)) {
      return res.status(400).json({ error: 'feedback_type must be bug or feature' })
    }

    // Rate limit: 5 posts per user per day
    if (user_id) {
      const today = new Date().toISOString().slice(0, 10)
      const { count } = await supabase
        .from('feedbacks')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user_id)
        .gte('created_at', `${today}T00:00:00Z`)
      if (count != null && count >= 5) {
        return res.status(429).json({ error: 'Daily limit reached (5 posts/day)' })
      }
    }

    const { data, error } = await supabase
      .from('feedbacks')
      .insert({
        content: content.trim().slice(0, 5000),
        feedback_type,
        source_url: source_url || null,
        user_id: user_id || null,
        channel: channel || 'web',
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to insert feedback:', error.message)
      return res.status(500).json({ error: 'Internal server error' })
    }
    return res.status(201).json({ data })
  } catch (err) {
    console.error('Unexpected error in feedback POST:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
