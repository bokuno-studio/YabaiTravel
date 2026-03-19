import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'yabai_travel' } }
)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const event = req.body
    const eventType = event?.type

    if (eventType === 'payment.completed' || eventType === 'payment.updated') {
      const payment = event?.data?.object?.payment
      const buyerEmail = payment?.buyer_email_address

      if (buyerEmail) {
        // Find user by email and upgrade to supporter
        const { data: users } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('id', (
            await supabase.rpc('get_user_id_by_email', { email_input: buyerEmail })
          ).data)

        if (users && users.length > 0) {
          await supabase
            .from('user_profiles')
            .update({ membership: 'supporter', updated_at: new Date().toISOString() })
            .eq('id', users[0].id)
        }
      }
    }

    return res.status(200).json({ received: true })
  } catch (e) {
    console.error('Square webhook error:', e)
    return res.status(200).json({ received: true })
  }
}
