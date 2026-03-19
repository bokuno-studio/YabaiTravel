import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'yabai_travel' } }
)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { feedback_id, user_id, voter_id } = req.body || {}

    if (!feedback_id) {
      return res.status(400).json({ error: 'feedback_id is required' })
    }

    if (!user_id && !voter_id) {
      return res.status(400).json({ error: 'Either user_id or voter_id is required' })
    }

    // Insert vote
    const voteData: Record<string, unknown> = { feedback_id }
    if (user_id) voteData.user_id = user_id
    if (voter_id) voteData.voter_id = voter_id

    const { error: voteError } = await supabase
      .from('feedback_votes')
      .insert(voteData)

    if (voteError) {
      // Unique constraint violation = already voted
      if (voteError.code === '23505') {
        return res.status(409).json({ error: 'Already voted' })
      }
      console.error('Failed to insert vote:', voteError)
      return res.status(500).json({ error: voteError.message })
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

    return res.status(201).json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: message })
  }
}
