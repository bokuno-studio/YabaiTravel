import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSquareCheckout, cancelMembership } from '../square'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('createSquareCheckout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns checkout URL on success', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ url: 'https://checkout.example.com' }),
    })

    const url = await createSquareCheckout({
      mode: 'subscription',
      lang: 'ja',
    })

    expect(url).toBe('https://checkout.example.com')
    expect(mockFetch).toHaveBeenCalledWith('/api/create-square-checkout', {
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

    await expect(createSquareCheckout({ mode: 'donation', amount: 1000 }))
      .rejects.toThrow('Card declined')
  })

  it('throws generic error when response has no error message', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.reject(new Error('Not JSON')),
    })

    await expect(createSquareCheckout({ mode: 'donation' }))
      .rejects.toThrow('Checkout creation failed')
  })

  it('passes all options to the API', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ url: 'https://checkout.example.com' }),
    })

    await createSquareCheckout({
      mode: 'donation',
      amount: 5000,
      currency: 'jpy',
      lang: 'ja',
      email: 'test@example.com',
      displayName: 'Test',
      userId: 'u-1',
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.mode).toBe('donation')
    expect(body.amount).toBe(5000)
    expect(body.currency).toBe('jpy')
    expect(body.email).toBe('test@example.com')
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
