import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover',
})

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { mode, amount, lang, email, userId, commentData } = req.body || {}
    const langPrefix = lang === 'en' ? '/en' : '/ja'
    const baseUrl = 'https://yabai.travel'

    if (mode === 'donation') {
      const unitAmount = amount || 500 // cents
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: 'yabai.travel Donation' },
            unit_amount: unitAmount,
          },
          quantity: 1,
        }],
        success_url: `${baseUrl}${langPrefix}/payment/success`,
        cancel_url: `${baseUrl}${langPrefix}/payment/cancel`,
      })
      return res.status(200).json({ url: session.url })
    }

    if (mode === 'subscription') {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: 'yabai.travel Crew Membership' },
            unit_amount: 1000,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        }],
        success_url: `${baseUrl}${langPrefix}/payment/success`,
        cancel_url: `${baseUrl}${langPrefix}/payment/cancel`,
        customer_email: email || undefined,
        metadata: {
          userId: userId || '',
          type: 'crew_subscription',
        },
      })
      return res.status(200).json({ url: session.url })
    }

    if (mode === 'comment') {
      const redirectUrl = commentData
        ? `${baseUrl}${langPrefix}/payment/success?pending_comment=${encodeURIComponent(commentData)}`
        : `${baseUrl}${langPrefix}/payment/success`

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: 'yabai.travel Comment' },
            unit_amount: 100,
          },
          quantity: 1,
        }],
        success_url: redirectUrl,
        cancel_url: `${baseUrl}${langPrefix}/payment/cancel`,
      })
      return res.status(200).json({ url: session.url })
    }

    return res.status(400).json({ error: 'Invalid mode' })
  } catch (e) {
    console.error('Stripe checkout error:', e)
    return res.status(500).json({ error: 'Failed to create checkout' })
  }
}
