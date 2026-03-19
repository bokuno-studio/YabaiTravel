export async function createSquareCheckout(options: {
  mode: 'donation' | 'subscription'
  amount?: number
  currency?: string
  lang?: string
}) {
  const res = await fetch('/api/create-square-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Checkout creation failed')
  }
  const data = await res.json()
  return data.url
}
