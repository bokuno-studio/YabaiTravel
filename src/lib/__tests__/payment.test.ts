import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createCheckout, cancelMembership } from '../payment'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('createCheckout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns checkout URL on success', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ url: 'https://squareup.com/checkout/pay_123' }),
    })

    const url = await createCheckout({
      mode: 'subscription',
      lang: 'ja',
    })

    expect(url).toBe('https://squareup.com/checkout/pay_123')
    expect(mockFetch).toHaveBeenCalledWith('/api/square-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'subscription', lang: 'ja' }),
    })
  })

  it('throws error with message from response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Card declined' }),
    })

    await expect(createCheckout({ mode: 'donation', amount: 1000 }))
      .rejects.toThrow('Card declined')
  })

  it('throws generic error when response has no error message', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.reject(new Error('Not JSON')),
    })

    await expect(createCheckout({ mode: 'donation' }))
      .rejects.toThrow('Checkout creation failed')
  })

  it('passes all options to the API', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ url: 'https://squareup.com/checkout/pay_123' }),
    })

    await createCheckout({
      mode: 'donation',
      amount: 5000,
      lang: 'ja',
      email: 'test@example.com',
      userId: 'u-1',
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.mode).toBe('donation')
    expect(body.amount).toBe(5000)
    expect(body.email).toBe('test@example.com')
  })

  it('supports comment mode with commentData', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ url: 'https://squareup.com/checkout/pay_456' }),
    })

    await createCheckout({
      mode: 'comment',
      lang: 'en',
      commentData: '{"content":"test"}',
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.mode).toBe('comment')
    expect(body.commentData).toBe('{"content":"test"}')
  })
})

describe('cancelMembership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves on successful cancellation', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    })

    await expect(cancelMembership('test-token')).resolves.toBeUndefined()
    expect(mockFetch).toHaveBeenCalledWith('/api/cancel-membership', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
    })
  })

  it('throws error on failure', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Unauthorized' }),
    })

    await expect(cancelMembership('bad-token')).rejects.toThrow('Unauthorized')
  })

  it('throws generic error when no error message in response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.reject(new Error('Parse error')),
    })

    await expect(cancelMembership('token')).rejects.toThrow('Cancellation failed')
  })
})
