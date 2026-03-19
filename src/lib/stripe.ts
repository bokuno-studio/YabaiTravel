import { loadStripe } from '@stripe/stripe-js'

export const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)

export async function createCheckoutSession(): Promise<string> {
  const response = await fetch('/api/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!response.ok) {
    const data = await response.json()
    throw new Error(data.error || 'Failed to create checkout session')
  }

  const data = await response.json()
  return data.url
}
