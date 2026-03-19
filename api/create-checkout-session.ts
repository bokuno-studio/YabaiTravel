import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-04-30.basil',
})

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { mode, amount, currency, lang } = req.body || {}
    const origin = req.headers.origin || 'https://yabai-travel.vercel.app'
    const langPrefix = lang === 'en' ? '/en' : '/ja'

    let sessionParams: Stripe.Checkout.SessionCreateParams

    if (mode === 'donation') {
      const donationCurrency = currency || 'jpy'
      const donationAmount = amount || (donationCurrency === 'jpy' ? 500 : 500) // 500 JPY or $5 (500 cents)

      sessionParams = {
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: donationCurrency,
              product_data: {
                name: 'yabai.travel 応援',
                description: lang === 'en'
                  ? 'One-time donation to yabai.travel'
                  : 'yabai.travel への応援寄付',
              },
              unit_amount: donationAmount,
            },
            quantity: 1,
          },
        ],
        success_url: `${origin}${langPrefix}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}${langPrefix}/payment/cancel`,
      }
    } else {
      // subscription mode (default)
      sessionParams = {
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'yabai.travel Supporter Membership',
                description: lang === 'en'
                  ? 'Monthly supporter membership'
                  : '応援メンバー（月額）',
              },
              unit_amount: 1000, // $10
              recurring: {
                interval: 'month',
              },
            },
            quantity: 1,
          },
        ],
        success_url: `${origin}${langPrefix}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}${langPrefix}/payment/cancel`,
      }
    }

    const session = await stripe.checkout.sessions.create(sessionParams)

    return res.status(200).json({ url: session.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Stripe checkout session creation failed:', message)
    return res.status(500).json({ error: message })
  }
}
