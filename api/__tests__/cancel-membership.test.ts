import { describe, it, expect, vi, beforeEach } from 'vitest'

let mockGetUserResult: { data: { user: unknown }; error: unknown } = { data: { user: null }, error: null }
let mockProfileResult: { data: unknown; error: unknown } = { data: null, error: null }
let mockUpdateResult: { data: unknown; error: unknown } = { data: null, error: null }

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn().mockImplementation(() => Promise.resolve(mockGetUserResult)),
    },
    from: vi.fn((table: string) => {
      if (table === 'user_profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(mockProfileResult),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue(mockUpdateResult),
          }),
        }
      }
      if (table === 'subscriptions') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue(mockUpdateResult),
            }),
          }),
        }
      }
      return {}
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }),
}))

// SquareClient is used with `new`, so mock it as a class
vi.mock('square', () => {
  class MockSquareClient {
    invoices = {
      search: vi.fn().mockResolvedValue({ invoices: null }),
      cancel: vi.fn().mockResolvedValue({}),
    }
  }
  return {
    SquareClient: MockSquareClient,
    SquareEnvironment: { Production: 'production' },
  }
})

import handler from '../cancel-membership'

function createMockReqRes(options: { method?: string; body?: unknown; headers?: Record<string, string> }) {
  const req = {
    method: options.method || 'POST',
    body: options.body,
    headers: options.headers || {},
  }
  const res: Record<string, unknown> = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  res.setHeader = vi.fn().mockReturnValue(res)
  return { req, res }
}

describe('POST /api/cancel-membership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUserResult = { data: { user: { id: 'u-1', email: 'test@example.com' } }, error: null }
    mockProfileResult = { data: { id: 'u-1', membership: 'supporter', square_customer_id: null }, error: null }
    mockUpdateResult = { data: null, error: null }
  })

  it('returns 401 when auth header is missing', async () => {
    const { req, res } = createMockReqRes({ headers: {} })
    await handler(req as never, res as never)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' })
  })

  it('returns 401 when token is invalid', async () => {
    mockGetUserResult = { data: { user: null }, error: { message: 'Invalid' } }
    const { req, res } = createMockReqRes({
      headers: { authorization: 'Bearer bad-token' },
    })
    await handler(req as never, res as never)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' })
  })

  it('returns 404 when profile is not found', async () => {
    mockProfileResult = { data: null, error: null }
    const { req, res } = createMockReqRes({
      headers: { authorization: 'Bearer valid-token' },
    })
    await handler(req as never, res as never)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith({ error: 'Profile not found' })
  })

  it('returns 400 when user is not a supporter', async () => {
    mockProfileResult = { data: { id: 'u-1', membership: 'free', square_customer_id: null }, error: null }
    const { req, res } = createMockReqRes({
      headers: { authorization: 'Bearer valid-token' },
    })
    await handler(req as never, res as never)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'No active membership to cancel' })
  })

  it('returns 200 on successful cancellation', async () => {
    const { req, res } = createMockReqRes({
      headers: { authorization: 'Bearer valid-token' },
    })
    await handler(req as never, res as never)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ success: true })
  })

  it('returns 405 for GET', async () => {
    const { req, res } = createMockReqRes({ method: 'GET', headers: {} })
    await handler(req as never, res as never)

    expect(res.status).toHaveBeenCalledWith(405)
    expect(res.setHeader).toHaveBeenCalledWith('Allow', 'POST')
  })
})
