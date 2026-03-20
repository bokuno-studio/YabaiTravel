import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { ok, created, badRequest, unauthorized, serverError } from './lib/response'
import { logger } from './lib/logger'

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

const postSchema = z.object({
  feedback_id: z.string().uuid(),
  content: z.string().min(1).max(2000),
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
    const { feedback_id } = req.query

    if (!feedback_id || typeof feedback_id !== 'string') {
      return badRequest(res, 'feedback_id query parameter is required')
    }

    const { data, error } = await supabaseAdmin
      .from('feedback_comments')
      .select('*')
      .eq('feedback_id', feedback_id)
      .order('created_at', { ascending: true })

    if (error) {
      logger.error({ err: error }, 'Failed to fetch comments')
      return serverError(res)
    }

    return ok(res, data)
  } catch (err) {
    logger.error({ err }, 'Unexpected error in feedback-comment GET')
    return serverError(res)
  }
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  try {
    // Extract JWT from Authorization header
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return unauthorized(res)
    }

    const token = authHeader.replace('Bearer ', '')

    // Verify the JWT and get the user
    const supabaseUser = createUserClient(token)
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()

    if (authError || !user) {
      return unauthorized(res)
    }

    const parsed = postSchema.safeParse(req.body)
    if (!parsed.success) {
      return badRequest(res, 'Validation failed', parsed.error.issues)
    }

    const { feedback_id, content } = parsed.data

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
      logger.error({ err: error }, 'Failed to insert comment')
      return serverError(res)
    }

    return created(res, data)
  } catch (err) {
    logger.error({ err }, 'Unexpected error in feedback-comment POST')
    return serverError(res)
  }
}
