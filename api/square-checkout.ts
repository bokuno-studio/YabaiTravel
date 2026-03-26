import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'

const SQUARE_BASE_URL = process.env.SQUARE_ENVIRONMENT === 'sandbox'
  ? 'https://connect.squareupsandbox.com'
  : 'https://connect.squareup.com'

async function squareRequest(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${SQUARE_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Square-Version': '2024-11-20',
      'Authorization': `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) {
    console.error('Square API error:', JSON.stringify(data))
    throw new Error(data.errors?.[0]?.detail || 'Square API error')
  }
  return data
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { mode, amount, lang, email, userId, commentData } = req.body || {}
    const langPrefix = lang === 'en' ? '/en' : '/ja'
    const baseUrl = 'https://yabai.travel'
    const idempotencyKey = crypto.randomUUID()

    if (mode === 'donation') {
      const unitAmount = amount || 500 // cents
      const data = await squareRequest('/v2/online-checkout/payment-links', {
        idempotency_key: idempotencyKey,
        quick_pay: {
          name: 'yabai.travel Donation',
          price_money: {
            amount: unitAmount,
            currency: 'USD',
          },
          location_id: process.env.SQUARE_LOCATION_ID,
        },
        checkout_options: {
          redirect_url: `${baseUrl}${langPrefix}/payment/success`,
        },
      })
      return res.status(200).json({ url: data.payment_link?.url || data.payment_link?.long_url })
    }

    if (mode === 'subscription') {
      // Use Square Payment Links for subscription
      // Square subscriptions require a catalog subscription plan.
      // We use a payment link with a note indicating monthly subscription.
      // The webhook will handle creating the actual subscription after first payment.
      const data = await squareRequest('/v2/online-checkout/payment-links', {
        idempotency_key: idempotencyKey,
        quick_pay: {
          name: 'yabai.travel Crew Membership ($10/month)',
          price_money: {
            amount: 1000, // $10.00 in cents
            currency: 'USD',
          },
          location_id: process.env.SQUARE_LOCATION_ID,
        },
        checkout_options: {
          redirect_url: `${baseUrl}${langPrefix}/payment/success`,
        },
        pre_populated_data: {
          buyer_email: email || undefined,
        },
        payment_note: JSON.stringify({
          type: 'crew_subscription',
          userId: userId || '',
        }),
      })
      return res.status(200).json({ url: data.payment_link?.url || data.payment_link?.long_url })
    }

    if (mode === 'comment') {
      const redirectUrl = commentData
        ? `${baseUrl}${langPrefix}/payment/success?pending_comment=${encodeURIComponent(commentData)}`
        : `${baseUrl}${langPrefix}/payment/success`

      const data = await squareRequest('/v2/online-checkout/payment-links', {
        idempotency_key: idempotencyKey,
        quick_pay: {
          name: 'yabai.travel Comment',
          price_money: {
            amount: 100, // $1.00
            currency: 'USD',
          },
          location_id: process.env.SQUARE_LOCATION_ID,
        },
        checkout_options: {
          redirect_url: redirectUrl,
        },
      })
      return res.status(200).json({ url: data.payment_link?.url || data.payment_link?.long_url })
    }

    return res.status(400).json({ error: 'Invalid mode' })
  } catch (e) {
    console.error('Square checkout error:', e)
    return res.status(500).json({ error: 'Failed to create checkout' })
  }
}
