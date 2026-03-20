import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover',
})

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'yabai_travel' } }
)

export const config = {
  api: { bodyParser: false },
}

async function buffer(readable: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  let event: Stripe.Event

  // Verify webhook signature
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (webhookSecret) {
    const sig = req.headers['stripe-signature'] as string
    if (!sig) {
      return res.status(401).json({ error: 'Missing signature' })
    }
    try {
      const body = await buffer(req)
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
    } catch (err) {
      console.error('Stripe webhook signature verification failed:', err)
      return res.status(401).json({ error: 'Invalid signature' })
    }
  } else {
    // No webhook secret configured; parse body directly (development only)
    event = req.body as Stripe.Event
  }

  try {
    console.log({ type: event.type }, 'Stripe webhook received')

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        await handleCheckoutCompleted(session)
        break
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        await handleSubscriptionDeleted(subscription)
        break
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        await handleSubscriptionUpdated(subscription)
        break
      }
    }

    return res.status(200).json({ received: true })
  } catch (e) {
    console.error({ err: e }, 'Stripe webhook error')
    // Always return 200 to prevent Stripe from retrying
    return res.status(200).json({ received: true })
  }
}

/**
 * Handle checkout.session.completed: upgrade membership or confirm comment.
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const metadata = session.metadata || {}

  if (metadata.type === 'crew_subscription') {
    const userId = metadata.userId
    const email = session.customer_email || session.customer_details?.email
    const stripeCustomerId = typeof session.customer === 'string'
      ? session.customer
      : session.customer?.id || null
    const stripeSubscriptionId = typeof session.subscription === 'string'
      ? session.subscription
      : (session.subscription as Stripe.Subscription | null)?.id || null

    // Calculate membership expiry (1 month from now)
    const expiresAt = new Date()
    expiresAt.setMonth(expiresAt.getMonth() + 1)

    if (userId) {
      const updateData: Record<string, unknown> = {
        membership: 'supporter',
        membership_expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      }
      if (stripeCustomerId) updateData.stripe_customer_id = stripeCustomerId
      if (stripeSubscriptionId) updateData.stripe_subscription_id = stripeSubscriptionId

      await supabase
        .from('user_profiles')
        .update(updateData)
        .eq('id', userId)
    } else if (email) {
      await upgradeMembershipByEmail(email, stripeCustomerId, stripeSubscriptionId, expiresAt)
    }

    // Create/update subscription record
    if (email) {
      await supabase
        .from('subscriptions')
        .upsert({
          email,
          stripe_customer_id: stripeCustomerId || null,
          stripe_subscription_id: stripeSubscriptionId || null,
          status: 'active',
          plan: 'crew',
          currency: 'usd',
          current_period_start: new Date().toISOString(),
          current_period_end: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'email',
        })
    }

    console.log({ userId, email }, 'Subscription activated via Stripe')
  }
}

/**
 * Handle customer.subscription.deleted: downgrade to free.
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const stripeCustomerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer?.id || null

  if (!stripeCustomerId) return

  await supabase
    .from('user_profiles')
    .update({
      membership: 'free',
      membership_expires_at: null,
      stripe_subscription_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_customer_id', stripeCustomerId)

  // Update subscription record
  await supabase
    .from('subscriptions')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_customer_id', stripeCustomerId)
    .eq('status', 'active')

  console.log({ stripeCustomerId }, 'Subscription cancelled via Stripe')
}

/**
 * Handle customer.subscription.updated: check if status changed.
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const stripeCustomerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer?.id || null

  if (!stripeCustomerId) return

  if (subscription.status === 'active') {
    const periodEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : null

    await supabase
      .from('user_profiles')
      .update({
        membership: 'supporter',
        membership_expires_at: periodEnd?.toISOString() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_customer_id', stripeCustomerId)

    if (periodEnd) {
      await supabase
        .from('subscriptions')
        .update({
          status: 'active',
          current_period_end: periodEnd.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_customer_id', stripeCustomerId)
    }
  } else if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
    await supabase
      .from('user_profiles')
      .update({
        membership: 'free',
        membership_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_customer_id', stripeCustomerId)
  }
}

/**
 * Upgrade membership by looking up auth user by email (fallback path).
 */
async function upgradeMembershipByEmail(
  email: string,
  stripeCustomerId: string | null,
  stripeSubscriptionId: string | null,
  expiresAt: Date
) {
  const { data: userId } = await supabase
    .rpc('get_user_id_by_email', { email_input: email })

  if (!userId) {
    console.error({ email }, 'No user found for email')
    return
  }

  const updateData: Record<string, unknown> = {
    membership: 'supporter',
    membership_expires_at: expiresAt.toISOString(),
    updated_at: new Date().toISOString(),
  }
  if (stripeCustomerId) updateData.stripe_customer_id = stripeCustomerId
  if (stripeSubscriptionId) updateData.stripe_subscription_id = stripeSubscriptionId

  await supabase
    .from('user_profiles')
    .update(updateData)
    .eq('id', userId)
}
