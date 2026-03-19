import { describe, it, expect, vi, beforeEach } from 'vitest'

// Shared mock state accessible from vi.mock factory via globalThis
;(globalThis as Record<string, unknown>).__fcMockState = {
  adminQueryResult: { data: [], error: null },
  adminInsertResult: { data: { id: 'c-1' }, error: null },
  getUserResult: { data: { user: { id: 'u-1' } }, error: null },
}

vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key')
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')
vi.stubEnv('SUPABASE_ANON_KEY', 'test-anon-key')

vi.mock('@supabase/supabase-js', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getState = () => (globalThis as any).__fcMockState as {
    adminQueryResult: { data: unknown; error: unknown }
    adminInsertResult: { data: unknown; error: unknown }
    getUserResult: { data: { user: unknown }; error: unknown }
  }

  const makeFn = vi.fn

  return {
    createClient: makeFn().mockImplementation(() => ({
      from: makeFn().mockImplementation(() => ({
        select: makeFn().mockImplementation(() => ({
          eq: makeFn().mockImplementation(() => ({
            order: makeFn().mockImplementation(() => Promise.resolve(getState().adminQueryResult)),
          })),
        })),
        insert: makeFn().mockImplementation(() => ({
          select: makeFn().mockImplementation(() => ({
            single: makeFn().mockImplementation(() => Promise.resolve(getState().adminInsertResult)),
          })),
        })),
      })),
      auth: {
        getUser: makeFn().mockImplementation(() => Promise.resolve(getState().getUserResult)),
      },
    })),
  }
})

import handler from '../feedback-comment'

// Helper to access the mock state
function getMockState() {
  return (globalThis as Record<string, unknown>).__fcMockState as {
    adminQueryResult: { data: unknown; error: unknown }
    adminInsertResult: { data: unknown; error: unknown }
    getUserResult: { data: { user: unknown }; error: unknown }
  }
}

function createMockReqRes(options: { method?: string; body?: unknown; query?: Record<string, string>; headers?: Record<string, string> }) {
  const req = {
    method: options.method || 'GET',
    body: options.body,
    query: options.query || {},
    headers: options.headers || {},
  }
  const res: Record<string, unknown> = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  res.setHeader = vi.fn().mockReturnValue(res)
  return { req, res }
}

describe('GET /api/feedback-comment', () => {
  beforeEach(() => {
    const state = getMockState()
    state.adminQueryResult = { data: [{ id: 'c-1', content: 'hello' }], error: null }
    state.getUserResult = { data: { user: { id: 'u-1' } }, error: null }
  })

  it('returns 200 with comments', async () => {
    const { req, res } = createMockReqRes({
      method: 'GET',
      query: { feedback_id: 'fb-1' },
    })
    await handler(req as never, res as never)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ data: [{ id: 'c-1', content: 'hello' }] })
  })

  it('returns 400 when feedback_id is missing', async () => {
    const { req, res } = createMockReqRes({ method: 'GET' })
    await handler(req as never, res as never)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'feedback_id query parameter is required' })
  })

  it('returns 500 on DB error', async () => {
    getMockState().adminQueryResult = { data: null, error: { message: 'DB error' } }
    const { req, res } = createMockReqRes({
      method: 'GET',
      query: { feedback_id: 'fb-1' },
    })
    await handler(req as never, res as never)

    expect(res.status).toHaveBeenCalledWith(500)
  })
})

describe('POST /api/feedback-comment', () => {
  beforeEach(() => {
    const state = getMockState()
    state.adminInsertResult = { data: { id: 'c-1', content: 'new comment' }, error: null }
    state.getUserResult = { data: { user: { id: 'u-1' } }, error: null }
  })

  it('returns 401 when auth header is missing', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      body: { feedback_id: 'fb-1', content: 'test' },
    })
    await handler(req as never, res as never)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' })
  })

  it('returns 401 when token is invalid', async () => {
    getMockState().getUserResult = { data: { user: null }, error: { message: 'Invalid token' } }
    const { req, res } = createMockReqRes({
      method: 'POST',
      body: { feedback_id: 'fb-1', content: 'test' },
      headers: { authorization: 'Bearer invalid-token' },
    })
    await handler(req as never, res as never)

    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('returns 400 when feedback_id is missing', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      body: { content: 'test' },
      headers: { authorization: 'Bearer valid-token' },
    })
    await handler(req as never, res as never)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'feedback_id is required' })
  })

  it('returns 400 when content is missing', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      body: { feedback_id: 'fb-1' },
      headers: { authorization: 'Bearer valid-token' },
    })
    await handler(req as never, res as never)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'content is required' })
  })

  it('returns 201 on successful comment creation', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      body: { feedback_id: 'fb-1', content: 'Great idea!' },
      headers: { authorization: 'Bearer valid-token' },
    })
    await handler(req as never, res as never)

    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.json).toHaveBeenCalledWith({ data: { id: 'c-1', content: 'new comment' } })
  })
})

describe('Method not allowed', () => {
  it('returns 405 for DELETE', async () => {
    const { req, res } = createMockReqRes({ method: 'DELETE' })
    await handler(req as never, res as never)

    expect(res.status).toHaveBeenCalledWith(405)
    expect(res.setHeader).toHaveBeenCalledWith('Allow', 'GET, POST')
  })
})
