import { loadStripe } from '@stripe/stripe-js'

export const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)

interface CheckoutOptions {
  mode: 'donation' | 'subscription'
  amount?: number
  currency?: 'jpy' | 'usd'
  lang?: string
}

export async function createCheckoutSession(options: CheckoutOptions): Promise<string> {
  const response = await fetch('/api/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  })

  if (!response.ok) {
    const data = await response.json()
    throw new Error(data.error || 'Failed to create checkout session')
  }

  const data = await response.json()
  return data.url
}
