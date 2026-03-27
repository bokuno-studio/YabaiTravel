import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'yabai_travel' } }
)

const SQUARE_BASE_URL = process.env.SQUARE_ENVIRONMENT === 'sandbox'
  ? 'https://connect.squareupsandbox.com'
  : 'https://connect.squareup.com'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Verify auth: expect Authorization header with Supabase JWT
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Unauthorized" })
    }

    const token = authHeader.slice(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return res.status(401).json({ error: "Unauthorized" })
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id, membership, square_customer_id, square_subscription_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' })
    }

    if (profile.membership !== 'supporter') {
      return res.status(400).json({ error: 'No active membership to cancel' })
    }

    // Cancel Square subscription if exists
    if (profile.square_subscription_id) {
      try {
        const cancelRes = await fetch(
          `${SQUARE_BASE_URL}/v2/subscriptions/${profile.square_subscription_id}/cancel`,
          {
            method: 'POST',
            headers: {
              'Square-Version': '2024-11-20',
              'Authorization': `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
              'Content-Type': 'application/json',
            },
          }
        )
        if (cancelRes.ok) {
          const cancelData = await cancelRes.json()
          const subscription = cancelData?.subscription
          const chargedThroughDate = subscription?.charged_through_date as string | undefined

          // Keep membership active until end of billing period
          await supabase
            .from('user_profiles')
            .update({
              membership: 'supporter',
              membership_expires_at: chargedThroughDate || null,
              updated_at: new Date().toISOString(),
              // Keep square_subscription_id — needed until period ends
            })
            .eq('id', user.id)

          // Mark subscription as pending cancellation
          const email = user.email
          if (email) {
            await supabase
              .from('subscriptions')
              .update({
                status: 'pending_cancellation',
                current_period_end: chargedThroughDate || null,
                updated_at: new Date().toISOString(),
              })
              .eq('email', email)
              .eq('status', 'active')
          }

          console.log({ subscriptionId: profile.square_subscription_id, chargedThroughDate }, 'Square subscription scheduled for cancellation at period end')
        } else {
          const errData = await cancelRes.json().catch(() => ({}))
          console.error({ err: errData }, 'Failed to cancel Square subscription')
          return res.status(502).json({ error: 'Failed to cancel subscription with payment provider' })
        }
      } catch (squareErr) {
        console.error({ err: squareErr }, 'Failed to cancel Square subscription')
        return res.status(502).json({ error: 'Failed to cancel subscription with payment provider' })
      }
    } else {
      // No Square subscription — direct downgrade (legacy/manual)
      await supabase
        .from('user_profiles')
        .update({
          membership: 'free',
          membership_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)
    }

    console.log({ userId: user.id }, 'Membership cancellation processed')
    return res.status(200).json({ data: { success: true } })
  } catch (e) {
    console.error({ err: e }, 'Cancel membership error')
    return res.status(500).json({ error: "Internal server error" })
  }
}
