import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { created, badRequest, serverError } from './lib/response'
import { rateLimit } from './lib/rate-limit'
import { logger } from './lib/logger'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'yabai_travel' } }
)

const postSchema = z.object({
  email: z.string().email(),
  content: z.string().min(1).max(5000),
})

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'
    if (!rateLimit(`inquiry:${ip}`, 5, 60000)) {
      return res.status(429).json({ error: 'Too many requests' })
    }

    const parsed = postSchema.safeParse(req.body)
    if (!parsed.success) {
      return badRequest(res, 'Validation failed', parsed.error.issues)
    }

    const { email, content } = parsed.data

    const { data, error } = await supabase
      .from('inquiries')
      .insert({
        email: email.trim(),
        content: content.trim(),
      })
      .select()
      .single()

    if (error) {
      logger.error({ err: error }, 'Failed to insert inquiry')
      return serverError(res)
    }

    return created(res, data)
  } catch (err) {
    logger.error({ err }, 'Unexpected error in inquiry')
    return serverError(res)
  }
}
