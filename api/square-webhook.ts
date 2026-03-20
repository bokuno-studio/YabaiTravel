import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { createHmac } from 'crypto'
import { logger } from './lib/logger'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'yabai_travel' } }
)

/**
 * Verify Square webhook signature if SQUARE_WEBHOOK_SIGNATURE_KEY is set.
 * Returns true if valid or if key is not configured (skips verification).
 */
function verifySquareSignature(req: VercelRequest): boolean {
  const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY
  if (!signatureKey) return true // skip verification if not configured

  const signature = req.headers['x-square-hmacsha256-signature'] as string
  if (!signature) return false

  const notificationUrl = process.env.SQUARE_WEBHOOK_URL || ''
  const body = JSON.stringify(req.body)
  const hmac = createHmac('sha256', signatureKey)
    .update(notificationUrl + body)
    .digest('base64')

  return hmac === signature
}

/**
 * Parse subscription metadata from payment note.
 */
function parsePaymentNote(note: string | undefined | null): {
  type?: string
  email?: string
  userId?: string
  squareCustomerId?: string
} {
  if (!note) return {}
  try {
    return JSON.parse(note)
  } catch {
    return {}
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Verify webhook signature
  if (!verifySquareSignature(req)) {
    logger.error('Square webhook: invalid signature')
    return res.status(401).json({ error: 'Invalid signature' })
  }

  try {
    const event = req.body
    const eventType = event?.type

    logger.info({ eventType }, 'Square webhook received')

    if (eventType === 'payment.completed' || eventType === 'payment.updated') {
      const payment = event?.data?.object?.payment
      if (!payment) {
        return res.status(200).json({ received: true })
      }

      const buyerEmail = payment.buyer_email_address
      const note = parsePaymentNote(payment.note)

      // Check if this is a crew subscription payment
      if (note.type === 'crew_subscription') {
        await handleSubscriptionPayment(note, buyerEmail, payment)
      } else if (buyerEmail) {
        // Legacy: try to upgrade by email match
        await upgradeMembershipByEmail(buyerEmail)
      }
    }

    // Handle invoice payment (for recurring monthly billing)
    if (eventType === 'invoice.payment_made') {
      const invoice = event?.data?.object?.invoice
      if (invoice) {
        await handleInvoicePayment(invoice)
      }
    }

    return res.status(200).json({ received: true })
  } catch (e) {
    logger.error({ err: e }, 'Square webhook error')
    // Always return 200 to prevent Square from retrying
    return res.status(200).json({ received: true })
  }
}

/**
 * Handle a crew subscription payment (initial sign-up).
 */
async function handleSubscriptionPayment(
  note: { email?: string; userId?: string; squareCustomerId?: string },
  buyerEmail: string | undefined,
  payment: { id?: string; total_money?: { amount?: number; currency?: string } }
) {
  const email = note.email || buyerEmail
  const userId = note.userId
  const squareCustomerId = note.squareCustomerId
  const currency = payment.total_money?.currency || 'JPY'

  if (!email && !userId) {
    logger.error('No email or userId in subscription payment')
    return
  }

  // Calculate membership expiry (1 month from now)
  const expiresAt = new Date()
  expiresAt.setMonth(expiresAt.getMonth() + 1)

  // Update user_profiles if we have a userId
  if (userId) {
    const updateData: Record<string, unknown> = {
      membership: 'supporter',
      membership_expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    }
    if (squareCustomerId) {
      updateData.square_customer_id = squareCustomerId
    }

    await supabase
      .from('user_profiles')
      .update(updateData)
      .eq('id', userId)
  } else if (email) {
    // Fallback: find user by email via auth lookup
    await upgradeMembershipByEmail(email, squareCustomerId, expiresAt)
  }

  // Create/update subscription record
  await supabase
    .from('subscriptions')
    .upsert({
      email: email || '',
      square_customer_id: squareCustomerId || null,
      status: 'active',
      plan: 'crew',
      currency,
      current_period_start: new Date().toISOString(),
      current_period_end: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'email',
    })

  logger.info({ email }, 'Subscription activated')
}

/**
 * Handle invoice payment (monthly renewal).
 */
async function handleInvoicePayment(invoice: {
  primary_recipient?: { customer_id?: string; email_address?: string }
  status?: string
  payment_requests?: Array<{ computed_amount_money?: { amount?: number; currency?: string } }>
}) {
  if (invoice.status !== 'PAID') return

  const customerId = invoice.primary_recipient?.customer_id
  const email = invoice.primary_recipient?.email_address

  if (!customerId && !email) return

  // Extend membership by 1 month
  const expiresAt = new Date()
  expiresAt.setMonth(expiresAt.getMonth() + 1)

  if (customerId) {
    await supabase
      .from('user_profiles')
      .update({
        membership: 'supporter',
        membership_expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('square_customer_id', customerId)
  }

  // Update subscription record
  if (email) {
    await supabase
      .from('subscriptions')
      .update({
        status: 'active',
        current_period_start: new Date().toISOString(),
        current_period_end: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('email', email)
  }

  logger.info({ customerId, email }, 'Membership renewed via invoice')
}

/**
 * Upgrade membership by looking up auth user by email (legacy/fallback path).
 */
async function upgradeMembershipByEmail(
  email: string,
  squareCustomerId?: string,
  expiresAt?: Date
) {
  const { data: userId } = await supabase
    .rpc('get_user_id_by_email', { email_input: email })

  if (!userId) {
    logger.error({ email }, 'No user found for email')
    return
  }

  const updateData: Record<string, unknown> = {
    membership: 'supporter',
    updated_at: new Date().toISOString(),
  }
  if (squareCustomerId) {
    updateData.square_customer_id = squareCustomerId
  }
  if (expiresAt) {
    updateData.membership_expires_at = expiresAt.toISOString()
  }

  await supabase
    .from('user_profiles')
    .update(updateData)
    .eq('id', userId)
}
