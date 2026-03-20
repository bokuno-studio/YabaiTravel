import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'yabai_travel' } }
)

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover',
})

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
      .select('id, membership, stripe_customer_id, stripe_subscription_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' })
    }

    if (profile.membership !== 'supporter') {
      return res.status(400).json({ error: 'No active membership to cancel' })
    }

    // Cancel Stripe subscription if exists
    if (profile.stripe_subscription_id) {
      try {
        await stripe.subscriptions.cancel(profile.stripe_subscription_id)
        console.log({ subscriptionId: profile.stripe_subscription_id }, 'Cancelled Stripe subscription')
      } catch (stripeErr) {
        console.error({ err: stripeErr }, 'Failed to cancel Stripe subscription')
        // Continue with local cancellation even if Stripe API fails
      }
    }

    // Update user profile: downgrade to free
    await supabase
      .from('user_profiles')
      .update({
        membership: 'free',
        membership_expires_at: null,
        stripe_subscription_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    // Update subscription record
    const email = user.email
    if (email) {
      await supabase
        .from('subscriptions')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('email', email)
        .eq('status', 'active')
    }

    console.log({ userId: user.id }, 'Membership cancelled')
    return res.status(200).json({ data: { success: true } })
  } catch (e) {
    console.error({ err: e }, 'Cancel membership error')
    return res.status(500).json({ error: "Internal server error" })
  }
}
