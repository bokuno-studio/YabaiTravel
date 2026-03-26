export async function createCheckout(options: {
  mode: 'donation' | 'subscription' | 'comment'
  amount?: number
  lang?: string
  email?: string
  userId?: string
  commentData?: string
}) {
  const res = await fetch('/api/square-checkout', {
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

export async function cancelMembership(accessToken: string): Promise<void> {
  const res = await fetch('/api/cancel-membership', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Cancellation failed')
  }
}
