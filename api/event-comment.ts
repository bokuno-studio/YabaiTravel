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

    // Phase 1: payment_id は 'free-phase1' を許可（Phase 2 で課金必須に戻す）
    const isFreeComment = payment_id === 'free-phase1'
    if (!isFreeComment && (!payment_id || typeof payment_id !== 'string')) {
      return res.status(400).json({ error: 'payment_id is required' })
    }

    // Authentication check for free comments
    if (isFreeComment) {
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' })
      }
      // Verify token via Supabase
      const token = authHeader.slice(7)
      const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser(token)
      if (authErr || !authUser) {
        return res.status(401).json({ error: 'Invalid or expired token' })
      }
    }

    // Rate limiting for free comments (keyed by user_id or IP)
    if (isFreeComment) {
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
        || req.headers['x-real-ip'] as string
        || 'unknown'
      const rateLimitKey = user_id || clientIp

      // 60-second cooldown
      const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString()
      let recentQuery = supabase
        .from('event_comments')
        .select('id', { count: 'exact', head: true })
        .eq('payment_id', 'free-phase1')
        .gte('created_at', oneMinuteAgo)
      recentQuery = user_id
        ? recentQuery.eq('user_id', rateLimitKey)
        : recentQuery.eq('display_name', display_name || '')
      const { count: recentCount } = await recentQuery
      if (recentCount != null && recentCount > 0) {
        return res.status(429).json({ error: 'Please wait 60 seconds between posts' })
      }

      // Daily limit: 3 comments per day
      const today = new Date().toISOString().slice(0, 10)
      let dailyQuery = supabase
        .from('event_comments')
        .select('id', { count: 'exact', head: true })
        .eq('payment_id', 'free-phase1')
        .gte('created_at', `${today}T00:00:00Z`)
      dailyQuery = user_id
        ? dailyQuery.eq('user_id', rateLimitKey)
        : dailyQuery.eq('display_name', display_name || '')
      const { count: dailyCount } = await dailyQuery
      if (dailyCount != null && dailyCount >= 3) {
        return res.status(429).json({ error: 'Daily limit reached (3 comments/day)' })
      }
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
        payment_id: payment_id?.trim() || 'free-phase1',
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
