import { describe, it, expect, vi, beforeEach } from 'vitest'

let mockResult: { data: unknown; error: unknown } = { data: { id: 'i-1' }, error: null }

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: vi.fn(() => ({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(mockResult),
        }),
      }),
    })),
  }),
}))

import handler from '../inquiry'

function createMockReqRes(options: { method?: string; body?: unknown }) {
  const req = {
    method: options.method || 'POST',
    body: options.body,
    headers: {},
  }
  const res: Record<string, unknown> = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  res.setHeader = vi.fn().mockReturnValue(res)
  return { req, res }
}

describe('POST /api/inquiry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResult = { data: { id: 'i-1' }, error: null }
  })

  it('returns 201 with valid email and content', async () => {
    const { req, res } = createMockReqRes({
      body: { email: 'test@example.com', content: 'Hello, I have a question.' },
    })
    await handler(req as never, res as never)

    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.json).toHaveBeenCalledWith({ data: { id: 'i-1' } })
  })

  it('returns 400 with invalid email', async () => {
    const { req, res } = createMockReqRes({
      body: { email: 'not-an-email', content: 'Hello' },
    })
    await handler(req as never, res as never)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Valid email is required' })
  })

  it('returns 400 when email is missing', async () => {
    const { req, res } = createMockReqRes({
      body: { content: 'Hello' },
    })
    await handler(req as never, res as never)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Valid email is required' })
  })

  it('returns 400 when content is missing', async () => {
    const { req, res } = createMockReqRes({
      body: { email: 'test@example.com' },
    })
    await handler(req as never, res as never)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Content is required' })
  })

  it('returns 400 when content is empty', async () => {
    const { req, res } = createMockReqRes({
      body: { email: 'test@example.com', content: '   ' },
    })
    await handler(req as never, res as never)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Content is required' })
  })

  it('returns 400 when content exceeds 5000 characters', async () => {
    const { req, res } = createMockReqRes({
      body: { email: 'test@example.com', content: 'x'.repeat(5001) },
    })
    await handler(req as never, res as never)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Content must be 5000 characters or less' })
  })

  it('returns 500 on DB error', async () => {
    mockResult = { data: null, error: { message: 'DB error' } }
    const { req, res } = createMockReqRes({
      body: { email: 'test@example.com', content: 'Hello' },
    })
    await handler(req as never, res as never)

    expect(res.status).toHaveBeenCalledWith(500)
  })
})

describe('Method not allowed', () => {
  it('returns 405 for GET', async () => {
    const { req, res } = createMockReqRes({ method: 'GET' })
    await handler(req as never, res as never)

    expect(res.status).toHaveBeenCalledWith(405)
    expect(res.setHeader).toHaveBeenCalledWith('Allow', 'POST')
  })
})
