import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { SquareClient, SquareEnvironment } from 'square'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'yabai_travel' } }
)

const squareClient = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN!,
  environment: SquareEnvironment.Production,
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
      .select('id, membership, square_customer_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return notFound(res, 'Profile not found')
    }

    if (profile.membership !== 'supporter') {
      return res.status(400).json({ error: 'No active membership to cancel' })
    }

    // Cancel any pending Square invoices for this customer
    if (profile.square_customer_id) {
      try {
        await cancelPendingInvoices(profile.square_customer_id)
      } catch (invoiceErr) {
        console.error({ err: invoiceErr }, 'Failed to cancel Square invoices')
        // Continue with local cancellation even if Square API fails
      }
    }

    // Update user profile: downgrade to free
    await supabase
      .from('user_profiles')
      .update({
        membership: 'free',
        membership_expires_at: null,
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

/**
 * Cancel any pending/unpaid invoices for a Square customer.
 */
async function cancelPendingInvoices(squareCustomerId: string) {
  const locationId = process.env.SQUARE_LOCATION_ID!

  // Search for pending invoices
  const searchResult = await squareClient.invoices.search({
    query: {
      filter: {
        locationIds: [locationId],
        customerIds: [squareCustomerId],
      },
      sort: {
        field: 'INVOICE_SORT_DATE',
        order: 'DESC',
      },
    },
  })

  if (!searchResult.invoices) return

  // Cancel unpaid invoices
  for (const invoice of searchResult.invoices) {
    if (invoice.status === 'UNPAID' || invoice.status === 'SCHEDULED') {
      try {
        await squareClient.invoices.cancel({
          invoiceId: invoice.id!,
          version: invoice.version!,
        })
        console.log({ invoiceId: invoice.id }, 'Cancelled Square invoice')
      } catch (cancelErr) {
        console.error({ err: cancelErr, invoiceId: invoice.id }, 'Failed to cancel invoice')
      }
    }
  }
}
