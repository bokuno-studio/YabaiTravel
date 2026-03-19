import { describe, it, expect, vi, beforeEach } from 'vitest'

let mockInsertResult: { data: unknown; error: unknown } = { data: null, error: null }
let mockRpcResult: { data: unknown; error: unknown } = { data: null, error: null }
let mockSelectResult: { data: unknown; error: unknown } = { data: { vote_count: 5 }, error: null }
let mockUpdateResult: { data: unknown; error: unknown } = { data: null, error: null }

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: vi.fn((table: string) => {
      if (table === 'feedback_votes') {
        return {
          insert: vi.fn().mockResolvedValue(mockInsertResult),
        }
      }
      if (table === 'feedbacks') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(mockSelectResult),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue(mockUpdateResult),
          }),
        }
      }
      return {}
    }),
    rpc: vi.fn().mockImplementation(() => Promise.resolve(mockRpcResult)),
  }),
}))

import handler from '../feedback-vote'

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

describe('POST /api/feedback-vote', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInsertResult = { data: null, error: null }
    mockRpcResult = { data: null, error: null }
    mockSelectResult = { data: { vote_count: 5 }, error: null }
    mockUpdateResult = { data: null, error: null }
  })

  it('returns 201 on successful vote', async () => {
    const { req, res } = createMockReqRes({
      body: { feedback_id: 'fb-1', voter_id: 'voter-1' },
    })
    await handler(req as never, res as never)

    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.json).toHaveBeenCalledWith({ success: true })
  })

  it('returns 400 when feedback_id is missing', async () => {
    const { req, res } = createMockReqRes({
      body: { voter_id: 'voter-1' },
    })
    await handler(req as never, res as never)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'feedback_id is required' })
  })

  it('returns 400 when both user_id and voter_id are missing', async () => {
    const { req, res } = createMockReqRes({
      body: { feedback_id: 'fb-1' },
    })
    await handler(req as never, res as never)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Either user_id or voter_id is required' })
  })

  it('returns 409 on duplicate vote (unique constraint violation)', async () => {
    mockInsertResult = { data: null, error: { code: '23505', message: 'Duplicate' } }
    const { req, res } = createMockReqRes({
      body: { feedback_id: 'fb-1', voter_id: 'voter-1' },
    })
    await handler(req as never, res as never)

    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith({ error: 'Already voted' })
  })

  it('returns 405 for GET', async () => {
    const { req, res } = createMockReqRes({ method: 'GET', body: {} })
    await handler(req as never, res as never)

    expect(res.status).toHaveBeenCalledWith(405)
    expect(res.setHeader).toHaveBeenCalledWith('Allow', 'POST')
  })

  it('falls back to manual increment when RPC fails', async () => {
    mockRpcResult = { data: null, error: { message: 'Function not found' } }
    const { req, res } = createMockReqRes({
      body: { feedback_id: 'fb-1', user_id: 'user-1' },
    })
    await handler(req as never, res as never)

    expect(res.status).toHaveBeenCalledWith(201)
  })
})
