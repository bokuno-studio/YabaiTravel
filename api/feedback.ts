import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { ok, created, badRequest, serverError } from './lib/response'
import { rateLimit } from './lib/rate-limit'
import { logger } from './lib/logger'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'yabai_travel' } }
)

const postSchema = z.object({
  content: z.string().min(1).max(5000),
  feedback_type: z.enum(['bug', 'feature']),
  source_url: z.string().url().optional(),
  channel: z.string().optional(),
  user_id: z.string().optional(),
})

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
      logger.error({ err: error }, 'Failed to fetch feedbacks')
      return serverError(res)
    }

    return ok(res, data)
  } catch (err) {
    logger.error({ err }, 'Unexpected error in feedback GET')
    return serverError(res)
  }
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  try {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'
    if (!rateLimit(`feedback:${ip}`, 10, 60000)) {
      return res.status(429).json({ error: 'Too many requests' })
    }

    const parsed = postSchema.safeParse(req.body)
    if (!parsed.success) {
      return badRequest(res, 'Validation failed', parsed.error.issues)
    }

    const { content, feedback_type, source_url, channel, user_id } = parsed.data

    const { data, error } = await supabase
      .from('feedbacks')
      .insert({
        content: content.trim(),
        feedback_type,
        source_url: source_url || null,
        user_id: user_id || null,
        channel: channel || 'web',
      })
      .select()
      .single()

    if (error) {
      logger.error({ err: error }, 'Failed to insert feedback')
      return serverError(res)
    }

    return created(res, data)
  } catch (err) {
    logger.error({ err }, 'Unexpected error in feedback POST')
    return serverError(res)
  }
}
