import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SquareClient, SquareEnvironment } from 'square'
import { randomUUID } from 'crypto'

const client = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN!,
  environment: SquareEnvironment.Production,
})

async function findOrCreateCustomer(email: string, displayName?: string): Promise<string> {
  const searchResult = await client.customers.search({
    query: { filter: { emailAddress: { exact: email } } },
  })
  if (searchResult.customers && searchResult.customers.length > 0) {
    return searchResult.customers[0].id!
  }
  const createResult = await client.customers.create({
    idempotencyKey: randomUUID(),
    emailAddress: email,
    givenName: displayName || undefined,
  })
  return createResult.customer!.id!
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { mode, amount, currency, lang, email, displayName, userId, commentData } = req.body || {}
    const langPrefix = lang === 'en' ? '/en' : '/ja'
    const baseUrl = 'https://yabai-travel.vercel.app'
    const locationId = process.env.SQUARE_LOCATION_ID!

    if (mode === 'donation') {
      const unitAmount = amount || 500 // cents
      const response = await client.checkout.paymentLinks.create({
        idempotencyKey: randomUUID(),
        quickPay: {
          name: 'yabai.travel Donation',
          priceMoney: { amount: BigInt(unitAmount), currency: 'USD' },
          locationId,
        },
        checkoutOptions: {
          redirectUrl: `${baseUrl}${langPrefix}/payment/success`,
        },
      })
      return res.status(200).json({ url: response.paymentLink?.url })
    }

    if (mode === 'subscription') {
      let squareCustomerId: string | undefined
      if (email) {
        try { squareCustomerId = await findOrCreateCustomer(email, displayName) } catch { /* continue */ }
      }
      const note = JSON.stringify({ type: 'crew_subscription', email: email || '', userId: userId || '', squareCustomerId: squareCustomerId || '' })
      const response = await client.checkout.paymentLinks.create({
        idempotencyKey: randomUUID(),
        quickPay: {
          name: 'yabai.travel Crew Membership',
          priceMoney: { amount: BigInt(1000), currency: 'USD' },
          locationId,
        },
        checkoutOptions: {
          redirectUrl: `${baseUrl}${langPrefix}/payment/success`,
        },
        paymentNote: note,
      })
      return res.status(200).json({ url: response.paymentLink?.url, squareCustomerId })
    }

    if (mode === 'comment') {
      // $1 for a comment
      const redirectUrl = commentData
        ? `${baseUrl}${langPrefix}/payment/success?pending_comment=${encodeURIComponent(commentData)}`
        : `${baseUrl}${langPrefix}/payment/success`

      const response = await client.checkout.paymentLinks.create({
        idempotencyKey: randomUUID(),
        quickPay: {
          name: 'yabai.travel Comment',
          priceMoney: { amount: BigInt(100), currency: 'USD' },
          locationId,
        },
        checkoutOptions: { redirectUrl },
      })
      return res.status(200).json({ url: response.paymentLink?.url })
    }

    return res.status(400).json({ error: 'Invalid mode' })
  } catch (e) {
    console.error('Square checkout error:', e)
    return res.status(500).json({ error: 'Failed to create checkout' })
  }
}
