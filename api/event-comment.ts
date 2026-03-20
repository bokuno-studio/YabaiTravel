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
    const { category_id, event_id, race_type, limit } = req.query
    const queryLimit = limit ? parseInt(String(limit), 10) : 50

    let query = supabase
      .from('event_comments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(queryLimit)

    if (category_id && typeof category_id === 'string') {
      query = query.eq('category_id', category_id)
    } else if (event_id && typeof event_id === 'string') {
      query = query.eq('event_id', event_id)
    } else if (race_type && typeof race_type === 'string') {
      query = query.eq('race_type', race_type)
    }

    const { data, error } = await query
    if (error) {
      console.error('Failed to fetch event comments:', error.message)
      return res.status(500).json({ error: 'Internal server error' })
    }
    return res.status(200).json({ data })
  } catch (err) {
    console.error('Unexpected error in event-comment GET:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  try {
    const { event_id, category_id, content, user_id, display_name, race_type, payment_id } = req.body || {}

    if (!event_id || typeof event_id !== 'string') {
      return res.status(400).json({ error: 'event_id is required' })
    }
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'content is required' })
    }
    if (!payment_id || typeof payment_id !== 'string' || payment_id.trim().length === 0) {
      return res.status(400).json({ error: 'payment_id is required' })
    }

    const { data, error } = await supabase
      .from('event_comments')
      .insert({
        event_id,
        category_id: category_id || null,
        content: content.trim().slice(0, 5000),
        user_id: user_id || null,
        display_name: display_name || null,
        race_type: race_type || null,
        payment_id: payment_id.trim(),
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to insert event comment:', error.message)
      return res.status(500).json({ error: 'Internal server error' })
    }
    return res.status(201).json({ data })
  } catch (err) {
    console.error('Unexpected error in event-comment POST:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
