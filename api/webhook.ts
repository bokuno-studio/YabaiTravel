import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-04-30.basil',
})

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'yabai_travel' } }
)

// Disable body parsing so we can access the raw body for signature verification
export const config = {
  api: {
    bodyParser: false,
  },
}

async function getRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

async function getCustomerEmail(customerId: string): Promise<string | null> {
  try {
    const customer = await stripe.customers.retrieve(customerId)
    if (customer.deleted) return null
    return customer.email || null
  } catch {
    return null
  }
}

async function updateMembershipByEmail(email: string, membership: 'supporter' | 'free', stripeCustomerId?: string, stripeSubscriptionId?: string) {
  // First try to find the user by email in auth.users via service role
  const { data: users } = await supabase.auth.admin.listUsers()
  const user = users?.users?.find((u) => u.email === email)

  if (!user) {
    console.log(`No user found with email ${email}, updating subscription record only`)
    return
  }

  const updateData: Record<string, unknown> = {
    membership,
    updated_at: new Date().toISOString(),
  }
  if (stripeCustomerId) updateData.stripe_customer_id = stripeCustomerId
  if (stripeSubscriptionId) updateData.stripe_subscription_id = stripeSubscriptionId

  const { error } = await supabase
    .from('user_profiles')
    .update(updateData)
    .eq('id', user.id)

  if (error) {
    console.error(`Failed to update user_profiles for ${email}:`, error)
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const sig = req.headers['stripe-signature']
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!sig || !webhookSecret) {
    return res.status(400).json({ error: 'Missing signature or webhook secret' })
  }

  let event: Stripe.Event

  try {
    const rawBody = await getRawBody(req)
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Webhook signature verification failed:', message)
    return res.status(400).json({ error: `Webhook Error: ${message}` })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session

        if (session.mode === 'subscription') {
          const email = session.customer_email || session.customer_details?.email
          if (email) {
            await updateMembershipByEmail(
              email,
              'supporter',
              session.customer as string,
              session.subscription as string
            )
          }

          // Also record in subscriptions table
          const { error } = await supabase.from('subscriptions').insert({
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            email: email || '',
            status: 'active',
            plan: 'supporter',
            current_period_start: new Date().toISOString(),
          })

          if (error) {
            console.error('Failed to insert subscription:', error)
          }
        }
        // For one-time donations (mode === 'payment'), no membership change needed
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer.id

        const email = await getCustomerEmail(customerId)
        if (email) {
          await updateMembershipByEmail(email, 'free')
        }

        // Update subscriptions table
        const { error } = await supabase
          .from('subscriptions')
          .update({
            status: 'cancelled',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscription.id)

        if (error) {
          console.error('Failed to update subscription status:', error)
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer.id

        const email = await getCustomerEmail(customerId)

        if (email) {
          if (subscription.status === 'active') {
            await updateMembershipByEmail(email, 'supporter', customerId, subscription.id)
          } else if (subscription.status === 'canceled' || subscription.status === 'unpaid' || subscription.status === 'past_due') {
            await updateMembershipByEmail(email, 'free')
          }
        }

        // Update subscriptions table
        const newStatus = subscription.status === 'active' ? 'active' : 'cancelled'
        const { error } = await supabase
          .from('subscriptions')
          .update({
            status: newStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscription.id)

        if (error) {
          console.error('Failed to update subscription:', error)
        }
        break
      }
    }
  } catch (err) {
    console.error('Error processing webhook event:', err)
  }

  return res.status(200).json({ received: true })
}
