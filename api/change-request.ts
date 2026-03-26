import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

function ok(res: VercelResponse, data: unknown) { return res.status(200).json({ data }) }
function created(res: VercelResponse, data: unknown) { return res.status(201).json({ data }) }
function badRequest(res: VercelResponse, message: string) { return res.status(400).json({ error: message }) }
function serverError(res: VercelResponse) { return res.status(500).json({ error: 'Internal server error' }) }

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'yabai_travel' } }
)

/** Field whitelist to prevent SQL injection via target_field */
const ALLOWED_EVENT_FIELDS = [
  'name', 'event_date', 'event_date_end', 'location', 'location_en',
  'country', 'country_en', 'official_url', 'entry_url', 'race_type',
  'participant_count', 'stay_status', 'weather_forecast', 'weather_forecast_en',
  'entry_start', 'entry_end', 'reception_place', 'reception_place_en',
  'start_place', 'start_place_en', 'prohibited_items', 'prohibited_items_en',
  'course_map_url', 'furusato_nozei_url', 'entry_type',
  'required_qualification', 'required_qualification_en',
  'previous_edition_url', 'visa_info', 'visa_info_en',
  'recovery_facilities', 'recovery_facilities_en',
  'photo_spots', 'photo_spots_en', 'description', 'description_en',
  'latitude', 'longitude',
]

const ALLOWED_CATEGORY_FIELDS = [
  'name', 'name_en', 'distance_km', 'elevation_gain',
  'start_time', 'reception_end', 'reception_place', 'reception_place_en',
  'start_place', 'start_place_en', 'finish_rate', 'time_limit',
  'required_pace', 'required_pace_en', 'required_climb_pace', 'required_climb_pace_en',
  'mandatory_gear', 'mandatory_gear_en', 'recommended_gear', 'recommended_gear_en',
  'prohibited_items', 'prohibited_items_en', 'poles_allowed',
  'entry_fee', 'entry_fee_currency', 'itra_points',
]

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleGet(req, res)
  if (req.method === 'POST') return handlePost(req, res)
  if (req.method === 'PATCH') return handlePatch(req, res)
  res.setHeader('Allow', 'GET, POST, PATCH')
  return res.status(405).json({ error: 'Method not allowed' })
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  try {
    const { event_id, category_id, status } = req.query
    let query = supabase
      .from('change_requests')
      .select('*, events:event_id(name), categories:category_id(name)')
      .order('created_at', { ascending: false })

    if (event_id && typeof event_id === 'string') {
      query = query.eq('event_id', event_id)
    }
    if (category_id && typeof category_id === 'string') {
      query = query.eq('category_id', category_id)
    }
    if (status && typeof status === 'string') {
      query = query.eq('status', status)
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
    // Authentication check
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' })
    }
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    const { event_id, category_id, field_name, current_value, suggested_value, reason } =
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
        user_id: user.id,
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

async function handlePatch(req: VercelRequest, res: VercelResponse) {
  try {
    const { id, action } = req.body || {}

    if (!id || typeof id !== 'string') {
      return badRequest(res, 'id is required')
    }
    if (action !== 'approve' && action !== 'reject') {
      return badRequest(res, 'action must be "approve" or "reject"')
    }

    // Fetch the change request
    const { data: cr, error: fetchError } = await supabase
      .from('change_requests')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !cr) {
      console.error('Failed to fetch change_request:', fetchError?.message)
      return res.status(404).json({ error: 'Change request not found' })
    }

    if (cr.status !== 'pending') {
      return badRequest(res, `Change request already ${cr.status as string}`)
    }

    if (action === 'reject') {
      const { data, error } = await supabase
        .from('change_requests')
        .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        console.error('Failed to reject change_request:', error.message)
        return serverError(res)
      }
      return ok(res, data)
    }

    // action === 'approve'
    const targetType = cr.target_type as string
    const targetId = cr.target_id as string
    const targetField = cr.target_field as string
    const proposedValue = cr.proposed_value as string

    // Validate field against whitelist
    const allowedFields = targetType === 'category' ? ALLOWED_CATEGORY_FIELDS : ALLOWED_EVENT_FIELDS
    if (!allowedFields.includes(targetField)) {
      return badRequest(res, `Field "${targetField}" is not allowed for ${targetType}`)
    }

    // Determine target table
    const targetTable = targetType === 'category' ? 'categories' : 'events'

    // Update the target record
    const { error: updateError } = await supabase
      .from(targetTable)
      .update({ [targetField]: proposedValue })
      .eq('id', targetId)

    if (updateError) {
      console.error(`Failed to update ${targetTable}:`, updateError.message)
      return serverError(res)
    }

    // Mark change request as approved
    const { data, error } = await supabase
      .from('change_requests')
      .update({ status: 'approved', reviewed_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Failed to approve change_request:', error.message)
      return serverError(res)
    }
    return ok(res, data)
  } catch (err) {
    console.error('Unexpected error in change-request PATCH:', err)
    return serverError(res)
  }
}
