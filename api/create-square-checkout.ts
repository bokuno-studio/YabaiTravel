import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SquareClient, SquareEnvironment } from 'square'
import { randomUUID } from 'crypto'

const client = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN!,
  environment: SquareEnvironment.Production,
})

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { mode, amount, currency, lang } = req.body || {}
    const langPrefix = lang === 'en' ? '/en' : '/ja'
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://yabai-travel.vercel.app'

    const redirectUrl = `${baseUrl}${langPrefix}/payment/success`
    const locationId = process.env.SQUARE_LOCATION_ID!

    if (mode === 'donation') {
      const unitAmount = currency === 'usd'
        ? (amount || 500)
        : (amount || 500)

      const response = await client.checkout.createPaymentLink({
        idempotencyKey: randomUUID(),
        quickPay: {
          name: 'yabai.travel 応援',
          priceMoney: {
            amount: BigInt(unitAmount),
            currency: currency === 'usd' ? 'USD' : 'JPY',
          },
          locationId,
        },
        checkoutOptions: {
          redirectUrl,
        },
      })

      return res.status(200).json({ url: response.paymentLink?.url })
    }

    if (mode === 'subscription') {
      // Crew membership: $10/month or ¥1,500/month
      // Square Subscriptions API is complex, so we use a one-time payment link
      // with a note that this is a membership activation.
      // Recurring billing will be handled via Square Invoices or manual renewal.
      const isJpy = lang !== 'en'
      const response = await client.checkout.createPaymentLink({
        idempotencyKey: randomUUID(),
        quickPay: {
          name: isJpy ? 'yabai.travel Crew メンバーシップ' : 'yabai.travel Crew Membership',
          priceMoney: {
            amount: isJpy ? BigInt(1500) : BigInt(1000),
            currency: isJpy ? 'JPY' : 'USD',
          },
          locationId,
        },
        checkoutOptions: {
          redirectUrl,
        },
      })

      return res.status(200).json({ url: response.paymentLink?.url })
    }

    return res.status(400).json({ error: 'Invalid mode' })
  } catch (e) {
    console.error('Square checkout error:', e)
    return res.status(500).json({ error: 'Failed to create checkout' })
  }
}
