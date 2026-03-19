import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'yabai_travel' } }
)

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { email, content } = req.body || {}

    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({ error: 'Valid email is required' })
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Content is required' })
    }

    if (content.trim().length > 5000) {
      return res.status(400).json({ error: 'Content must be 5000 characters or less' })
    }

    const { data, error } = await supabase
      .from('inquiries')
      .insert({
        email: email.trim(),
        content: content.trim(),
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to insert inquiry:', error)
      return res.status(500).json({ error: error.message })
    }

    return res.status(201).json({ data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: message })
  }
}
