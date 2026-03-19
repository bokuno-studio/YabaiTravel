import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock env vars before importing handler
beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
  vi.stubEnv('SQUARE_ACCESS_TOKEN', 'sq-test')
})

function createMockRes() {
  const res: Record<string, unknown> = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  res.setHeader = vi.fn().mockReturnValue(res)
  return res
}

describe('GET /api/health', () => {
  it('returns 200 with ok:true and env flags', async () => {
    const handler = (await import('../health')).default
    const req = { method: 'GET' } as never
    const res = createMockRes()

    handler(req, res as never)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      env: {
        hasSupabaseUrl: true,
        hasServiceKey: true,
        hasSquareToken: true,
      },
    })
  })

  it('reports missing env vars as false', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    vi.stubEnv('SQUARE_ACCESS_TOKEN', '')

    // Re-import to get fresh module with empty env
    vi.resetModules()
    const handler = (await import('../health')).default
    const req = { method: 'GET' } as never
    const res = createMockRes()

    handler(req, res as never)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      env: {
        hasSupabaseUrl: false,
        hasServiceKey: false,
        hasSquareToken: false,
      },
    })
  })
})
