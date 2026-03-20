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
  feedback_id: z.string().uuid(),
  voter_id: z.string().min(1),
  user_id: z.string().optional(),
})

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'
    if (!rateLimit(`feedback-vote:${ip}`, 30, 60000)) {
      return res.status(429).json({ error: 'Too many requests' })
    }

    const parsed = postSchema.safeParse(req.body)
    if (!parsed.success) {
      return badRequest(res, 'Validation failed', parsed.error.issues)
    }

    const { feedback_id, voter_id, user_id } = parsed.data

    // Insert vote
    const voteData: Record<string, unknown> = { feedback_id, voter_id }
    if (user_id) voteData.user_id = user_id

    const { error: voteError } = await supabase
      .from('feedback_votes')
      .insert(voteData)

    if (voteError) {
      // Unique constraint violation = already voted
      if (voteError.code === '23505') {
        return res.status(409).json({ error: 'Already voted' })
      }
      logger.error({ err: voteError }, 'Failed to insert vote')
      return serverError(res)
    }

    // Increment vote_count on the feedback
    const { error: updateError } = await supabase.rpc('increment_vote_count', {
      fid: feedback_id,
    })

    // If RPC doesn't exist, fall back to manual increment
    if (updateError) {
      const { data: feedback } = await supabase
        .from('feedbacks')
        .select('vote_count')
        .eq('id', feedback_id)
        .single()

      if (feedback) {
        await supabase
          .from('feedbacks')
          .update({ vote_count: feedback.vote_count + 1 })
          .eq('id', feedback_id)
      }
    }

    return created(res, { success: true })
  } catch (err) {
    logger.error({ err }, 'Unexpected error in feedback-vote')
    return serverError(res)
  }
}
