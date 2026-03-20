import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { created, badRequest, serverError, ok } from './lib/response'

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
    const { event_id, category_id } = req.query
    let query = supabase
      .from('change_requests')
      .select('*')
      .order('created_at', { ascending: false })

    if (event_id && typeof event_id === 'string') {
      query = query.eq('event_id', event_id)
    }
    if (category_id && typeof category_id === 'string') {
      query = query.eq('category_id', category_id)
    }

    const { data, error } = await query
    if (error) {
      console.error('Failed to fetch change_requests:', error.message)
      return serverError(res)
    }
    return ok(res, data)
  } catch (err) {
    console.error('Unexpected error in change-request GET:', err)
    return serverError(res)
  }
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  try {
    const { event_id, category_id, field_name, current_value, suggested_value, reason, user_id } =
      req.body || {}

    if (!event_id || typeof event_id !== 'string') {
      return badRequest(res, 'event_id is required')
    }
    if (!field_name || typeof field_name !== 'string') {
      return badRequest(res, 'field_name is required')
    }
    if (!suggested_value || typeof suggested_value !== 'string' || suggested_value.trim().length === 0) {
      return badRequest(res, 'suggested_value is required')
    }

    const targetType = category_id ? 'category' : 'event'
    const targetId = category_id || event_id

    const { data, error } = await supabase
      .from('change_requests')
      .insert({
        target_type: targetType,
        target_id: targetId,
        target_field: field_name,
        proposed_value: suggested_value.trim().slice(0, 5000),
        event_id,
        category_id: category_id || null,
        current_value: current_value ? String(current_value).slice(0, 5000) : null,
        reason: reason ? String(reason).trim().slice(0, 2000) : null,
        user_id: user_id || null,
        status: 'pending',
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to insert change_request:', error.message)
      return serverError(res)
    }
    return created(res, data)
  } catch (err) {
    console.error('Unexpected error in change-request POST:', err)
    return serverError(res)
  }
}
