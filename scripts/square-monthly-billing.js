/**
 * Square Monthly Billing Script
 *
 * Creates Square invoices for all active Crew members whose membership
 * is about to expire (within 7 days). Runs monthly via GitHub Actions.
 *
 * Required env vars:
 *   DATABASE_URL - PostgreSQL connection string
 *   SQUARE_ACCESS_TOKEN - Square API token
 *   SQUARE_LOCATION_ID - Square location ID
 */

import pg from 'pg'
import { SquareClient, SquareEnvironment } from 'square'
import { randomUUID } from 'crypto'

const { Client } = pg

const SCHEMA = process.env.SUPABASE_SCHEMA || 'yabai_travel'

const db = new Client({ connectionString: process.env.DATABASE_URL })
const square = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN,
  environment: SquareEnvironment.Production,
})

async function main() {
  await db.connect()
  console.log('Connected to database')

  try {
    // Find active Crew members whose membership expires within 7 days
    const { rows: members } = await db.query(`
      SELECT
        up.id,
        up.square_customer_id,
        up.membership_expires_at,
        s.email,
        s.currency
      FROM ${SCHEMA}.user_profiles up
      JOIN ${SCHEMA}.subscriptions s
        ON up.square_customer_id = s.square_customer_id
      WHERE up.membership = 'supporter'
        AND s.status = 'active'
        AND up.square_customer_id IS NOT NULL
        AND up.membership_expires_at IS NOT NULL
        AND up.membership_expires_at <= NOW() + INTERVAL '7 days'
    `)

    console.log(`Found ${members.length} members due for renewal`)

    let created = 0
    let failed = 0

    for (const member of members) {
      try {
        await createInvoice(member)
        created++
        console.log(`Invoice created for ${member.email}`)
      } catch (err) {
        failed++
        console.error(`Failed to create invoice for ${member.email}:`, err.message)
      }
    }

    console.log(`\nBilling complete: ${created} invoices created, ${failed} failed`)

    // Also check for expired memberships (past due by more than 14 days)
    await expireOverdueMembers()
  } finally {
    await db.end()
  }
}

/**
 * Create a Square invoice for a crew member.
 */
async function createInvoice(member) {
  const locationId = process.env.SQUARE_LOCATION_ID
  const isJpy = member.currency === 'JPY'
  const amount = isJpy ? 1500 : 1000
  const currency = member.currency || 'JPY'

  // Calculate billing period
  const periodStart = new Date()
  const periodEnd = new Date()
  periodEnd.setMonth(periodEnd.getMonth() + 1)

  // Create the invoice
  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + 7) // Due in 7 days
  const dueDateStr = dueDate.toISOString().split('T')[0] // YYYY-MM-DD

  const invoiceResponse = await square.invoices.create({
    invoice: {
      locationId,
      primaryRecipient: {
        customerId: member.square_customer_id,
      },
      paymentRequests: [
        {
          requestType: 'BALANCE',
          dueDate: dueDateStr,
          automaticPaymentSource: 'NONE',
          reminders: [
            {
              relativeScheduledDays: -1,
              message: isJpy
                ? 'yabai.travel Crew メンバーシップの更新日が近づいています。'
                : 'Your yabai.travel Crew membership renewal is coming up.',
            },
          ],
        },
      ],
      deliveryMethod: 'EMAIL',
      title: isJpy ? 'yabai.travel Crew メンバーシップ' : 'yabai.travel Crew Membership',
      description: isJpy
        ? `Crew メンバーシップ月額料金 (${periodStart.toLocaleDateString('ja-JP')} - ${periodEnd.toLocaleDateString('ja-JP')})`
        : `Crew Membership monthly fee (${periodStart.toLocaleDateString('en-US')} - ${periodEnd.toLocaleDateString('en-US')})`,
      acceptedPaymentMethods: {
        card: true,
        squareGiftCard: false,
        bankAccount: false,
        buyNowPayLater: false,
        cashAppPay: false,
      },
    },
    idempotencyKey: randomUUID(),
  })

  const invoiceId = invoiceResponse.invoice?.id
  if (!invoiceId) {
    throw new Error('Invoice creation returned no ID')
  }

  // Add line item via update (Square requires order for line items in create,
  // but we can use a simpler approach with custom amounts in payment request)

  // Publish the invoice to send it to the customer
  await square.invoices.publish({
    invoiceId,
    version: invoiceResponse.invoice?.version || 0,
    idempotencyKey: randomUUID(),
  })

  // Record in our subscriptions table
  await db.query(`
    UPDATE ${SCHEMA}.subscriptions
    SET
      square_invoice_id = $1,
      current_period_start = $2,
      current_period_end = $3,
      updated_at = NOW()
    WHERE square_customer_id = $4
      AND status = 'active'
  `, [invoiceId, periodStart.toISOString(), periodEnd.toISOString(), member.square_customer_id])

  return invoiceId
}

/**
 * Expire memberships that are overdue by more than 14 days
 * (i.e., invoice was sent but not paid).
 */
async function expireOverdueMembers() {
  const result = await db.query(`
    UPDATE ${SCHEMA}.user_profiles
    SET
      membership = 'free',
      updated_at = NOW()
    WHERE membership = 'supporter'
      AND membership_expires_at IS NOT NULL
      AND membership_expires_at < NOW() - INTERVAL '14 days'
    RETURNING id
  `)

  if (result.rows.length > 0) {
    console.log(`Expired ${result.rows.length} overdue memberships`)

    // Also update subscription records
    await db.query(`
      UPDATE ${SCHEMA}.subscriptions
      SET status = 'expired', updated_at = NOW()
      WHERE square_customer_id IN (
        SELECT square_customer_id
        FROM ${SCHEMA}.user_profiles
        WHERE id = ANY($1::uuid[])
      )
      AND status = 'active'
    `, [result.rows.map(r => r.id)])
  }
}

main().catch((err) => {
  console.error('Monthly billing failed:', err)
  process.exit(1)
})
