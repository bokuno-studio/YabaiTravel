import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

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

function verifySquareSignature(body: Buffer, signature: string, notificationUrl: string): boolean {
  const webhookSignatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY
  if (!webhookSignatureKey) return false

  const payload = notificationUrl + body.toString('utf8')
  const expectedSignature = crypto
    .createHmac('sha256', webhookSignatureKey)
    .update(payload)
    .digest('base64')

  return signature === expectedSignature
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const body = await buffer(req)
  let event: Record<string, unknown>

  // Verify webhook signature
  const webhookSignatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY
  if (webhookSignatureKey) {
    const signature = req.headers['x-square-hmacsha256-signature'] as string
    if (!signature) {
      return res.status(401).json({ error: 'Missing signature' })
    }

    const notificationUrl = `https://yabai.travel/api/square-webhook`
    if (!verifySquareSignature(body, signature, notificationUrl)) {
      console.error('Square webhook signature verification failed')
      return res.status(401).json({ error: 'Invalid signature' })
    }
  }

  try {
    event = JSON.parse(body.toString('utf8'))
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  try {
    const eventType = event.type as string
    console.log({ type: eventType }, 'Square webhook received')

    switch (eventType) {
      case 'payment.updated': {
        await handlePaymentCompleted(event.data as Record<string, unknown>)
        break
      }
      case 'subscription.created': {
        await handleSubscriptionCreated(event.data as Record<string, unknown>)
        break
      }
      case 'subscription.updated': {
        await handleSubscriptionUpdated(event.data as Record<string, unknown>)
        break
      }
    }

    return res.status(200).json({ received: true })
  } catch (e) {
    console.error({ err: e }, 'Square webhook error')
    // Always return 200 to prevent Square from retrying
    return res.status(200).json({ received: true })
  }
}

/**
 * Handle payment.updated: activate membership for crew subscription payments.
 */
async function handlePaymentCompleted(data: Record<string, unknown>) {
  const object = data?.object as Record<string, unknown> | undefined
  const payment = object?.payment as Record<string, unknown> | undefined
  if (!payment) return

  // Only process completed payments
  const status = payment.status as string | undefined
  if (status !== 'COMPLETED') return

  const note = payment.note as string | undefined
  if (!note) return

  let metadata: { type?: string; userId?: string }
  try {
    metadata = JSON.parse(note)
  } catch {
    return // Not a structured payment note
  }

  if (metadata.type !== 'crew_subscription') return

  const squareCustomerId = payment.customer_id as string | null
  const squarePaymentId = payment.id as string | null
  const buyerEmail = (payment.buyer_email_address as string) || null

  // Calculate membership expiry (1 month from now)
  const expiresAt = new Date()
  expiresAt.setMonth(expiresAt.getMonth() + 1)

  if (metadata.userId) {
    const updateData: Record<string, unknown> = {
      membership: 'supporter',
      membership_expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    }
    if (squareCustomerId) updateData.square_customer_id = squareCustomerId
    if (squarePaymentId) updateData.square_subscription_id = squarePaymentId

    await supabase
      .from('user_profiles')
      .update(updateData)
      .eq('id', metadata.userId)
  } else if (buyerEmail) {
    await upgradeMembershipByEmail(buyerEmail, squareCustomerId, squarePaymentId, expiresAt)
  }

  // Create/update subscription record
  if (buyerEmail) {
    await supabase
      .from('subscriptions')
      .upsert({
        email: buyerEmail,
        square_customer_id: squareCustomerId || null,
        square_subscription_id: squarePaymentId || null,
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

  console.log({ userId: metadata.userId, email: buyerEmail }, 'Subscription activated via Square')
}

/**
 * Handle subscription.created: activate membership.
 */
async function handleSubscriptionCreated(data: Record<string, unknown>) {
  const object = data?.object as Record<string, unknown> | undefined
  const subscription = object?.subscription as Record<string, unknown> | undefined
  if (!subscription) return

  const squareCustomerId = subscription.customer_id as string | null
  if (!squareCustomerId) return

  const status = subscription.status as string
  if (status === 'ACTIVE') {
    await supabase
      .from('user_profiles')
      .update({
        membership: 'supporter',
        membership_expires_at: subscription.charged_through_date || null,
        updated_at: new Date().toISOString(),
      })
      .eq('square_customer_id', squareCustomerId)
  }
}

/**
 * Handle subscription.updated: check status changes (cancelled, paused, etc.).
 */
async function handleSubscriptionUpdated(data: Record<string, unknown>) {
  const object = data?.object as Record<string, unknown> | undefined
  const subscription = object?.subscription as Record<string, unknown> | undefined
  if (!subscription) return

  const squareCustomerId = subscription.customer_id as string | null
  if (!squareCustomerId) return

  const status = subscription.status as string

  if (status === 'ACTIVE') {
    await supabase
      .from('user_profiles')
      .update({
        membership: 'supporter',
        membership_expires_at: (subscription.charged_through_date as string) || null,
        updated_at: new Date().toISOString(),
      })
      .eq('square_customer_id', squareCustomerId)

    await supabase
      .from('subscriptions')
      .update({
        status: 'active',
        current_period_end: (subscription.charged_through_date as string) || null,
        updated_at: new Date().toISOString(),
      })
      .eq('square_customer_id', squareCustomerId)
  } else if (status === 'CANCELED' || status === 'DEACTIVATED') {
    await supabase
      .from('user_profiles')
      .update({
        membership: 'free',
        membership_expires_at: null,
        square_subscription_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('square_customer_id', squareCustomerId)

    await supabase
      .from('subscriptions')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('square_customer_id', squareCustomerId)
      .eq('status', 'active')

    console.log({ squareCustomerId }, 'Subscription cancelled via Square')
  }
}

/**
 * Upgrade membership by looking up auth user by email (fallback path).
 */
async function upgradeMembershipByEmail(
  email: string,
  squareCustomerId: string | null,
  squareSubscriptionId: string | null,
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
  if (squareCustomerId) updateData.square_customer_id = squareCustomerId
  if (squareSubscriptionId) updateData.square_subscription_id = squareSubscriptionId

  await supabase
    .from('user_profiles')
    .update(updateData)
    .eq('id', userId)
}
