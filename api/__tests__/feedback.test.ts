import { describe, it, expect, vi, beforeEach } from 'vitest'

// Build a chainable mock for supabase queries
function buildChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.insert = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.range = vi.fn().mockResolvedValue(result)
  chain.single = vi.fn().mockResolvedValue(result)
  return chain
}

let mockChain = buildChain({ data: [], error: null })

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: vi.fn(() => mockChain),
  }),
}))

// Must import after mocks
import handler from '../feedback'

function createMockReqRes(options: { method?: string; body?: unknown; query?: Record<string, string> }) {
  const req = {
    method: options.method || 'GET',
    body: options.body,
    query: options.query || {},
    headers: {},
  }
  const res: Record<string, unknown> = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  res.setHeader = vi.fn().mockReturnValue(res)
  return { req, res }
}

describe('GET /api/feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChain = buildChain({ data: [{ id: '1', content: 'test' }], error: null })
  })

  it('returns 200 with feedback list', async () => {
    const { req, res } = createMockReqRes({ method: 'GET' })
    await handler(req as never, res as never)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ data: [{ id: '1', content: 'test' }] })
  })

  it('applies type and status query params', async () => {
    const { req, res } = createMockReqRes({
      method: 'GET',
      query: { type: 'bug', status: 'new' },
    })
    await handler(req as never, res as never)
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('returns 500 on DB error', async () => {
    mockChain = buildChain({ data: null, error: { message: 'DB error' } })
    const { req, res } = createMockReqRes({ method: 'GET' })
    await handler(req as never, res as never)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ error: 'DB error' })
  })
})

describe('POST /api/feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChain = buildChain({ data: { id: '1', content: 'test' }, error: null })
  })

  it('returns 201 with created feedback', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      body: { content: 'New feature idea', feedback_type: 'feature' },
    })
    await handler(req as never, res as never)

    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.json).toHaveBeenCalledWith({ data: { id: '1', content: 'test' } })
  })

  it('returns 400 when content is missing', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      body: {},
    })
    await handler(req as never, res as never)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'content is required' })
  })

  it('returns 400 when content is empty string', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      body: { content: '   ' },
    })
    await handler(req as never, res as never)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'content is required' })
  })

  it('defaults feedback_type to feature when not bug', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      body: { content: 'Test', feedback_type: 'unknown' },
    })
    await handler(req as never, res as never)
    expect(res.status).toHaveBeenCalledWith(201)
  })
})

describe('Method not allowed', () => {
  it('returns 405 for PUT', async () => {
    const { req, res } = createMockReqRes({ method: 'PUT' })
    await handler(req as never, res as never)

    expect(res.status).toHaveBeenCalledWith(405)
    expect(res.setHeader).toHaveBeenCalledWith('Allow', 'GET, POST')
  })
})
