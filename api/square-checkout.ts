import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'

const SQUARE_BASE_URL = process.env.SQUARE_ENVIRONMENT === 'sandbox'
  ? 'https://connect.squareupsandbox.com'
  : 'https://connect.squareup.com'

async function squareRequest(path: string, body: Record<string, unknown>) {
  const accessToken = process.env.SQUARE_ACCESS_TOKEN
  if (!accessToken) {
    throw new Error('SQUARE_ACCESS_TOKEN is not configured')
  }

  const res = await fetch(`${SQUARE_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Square-Version': '2024-11-20',
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) {
    const errorDetail = data.errors?.[0]?.detail || data.errors?.[0]?.code || 'Unknown Square API error'
    const errorCategory = data.errors?.[0]?.category || ''
    console.error('Square API error:', JSON.stringify(data))
    throw new Error(`${errorCategory}: ${errorDetail}`)
  }
  return data
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Pre-flight: check required env vars
  const missingVars = ['SQUARE_ACCESS_TOKEN', 'SQUARE_LOCATION_ID']
    .filter(v => !process.env[v])
  if (missingVars.length > 0) {
    console.error('Missing env vars:', missingVars.join(', '))
    return res.status(500).json({ error: `Server configuration error: missing ${missingVars.join(', ')}` })
  }

  try {
    const { mode, amount, lang, email, userId, commentData } = req.body || {}
    const langPrefix = lang === 'en' ? '/en' : '/ja'
    const baseUrl = 'https://yabai.travel'
    const idempotencyKey = crypto.randomUUID()
    const locationId = process.env.SQUARE_LOCATION_ID!

    if (mode === 'donation') {
      const unitAmount = amount || 500 // JPY
      const data = await squareRequest('/v2/online-checkout/payment-links', {
        idempotency_key: idempotencyKey,
        quick_pay: {
          name: 'yabai.travel Donation',
          price_money: {
            amount: unitAmount,
            currency: 'JPY',
          },
          location_id: locationId,
        },
        checkout_options: {
          redirect_url: `${baseUrl}${langPrefix}/payment/success`,
        },
      })
      return res.status(200).json({ url: data.payment_link?.url || data.payment_link?.long_url })
    }

    if (mode === 'subscription') {
      // Crew Membership: ¥1,500/month as one-time payment
      // Subscription management is handled via webhook (payment.updated)
      const note = JSON.stringify({ type: 'crew_subscription', userId: userId || '' })
      const data = await squareRequest('/v2/online-checkout/payment-links', {
        idempotency_key: idempotencyKey,
        quick_pay: {
          name: 'yabai.travel Crew Membership (¥1,500/月)',
          price_money: {
            amount: 1500,
            currency: 'JPY',
          },
          location_id: locationId,
        },
        checkout_options: {
          redirect_url: `${baseUrl}${langPrefix}/payment/success`,
        },
        pre_populated_data: email ? {
          buyer_email: email,
        } : undefined,
        payment_note: note,
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
            amount: 150, // ¥150
            currency: 'JPY',
          },
          location_id: locationId,
        },
        checkout_options: {
          redirect_url: redirectUrl,
        },
      })
      return res.status(200).json({ url: data.payment_link?.url || data.payment_link?.long_url })
    }

    return res.status(400).json({ error: `Invalid mode: ${mode || '(empty)'}` })
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    console.error('Square checkout error:', errorMessage, e)
    return res.status(500).json({ error: `Checkout failed: ${errorMessage}` })
  }
}
