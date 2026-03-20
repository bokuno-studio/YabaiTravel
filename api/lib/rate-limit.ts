// Simple in-memory rate limiter (resets when serverless function cold starts)
const hits = new Map<string, { count: number; resetAt: number }>()

export function rateLimit(key: string, maxRequests = 20, windowMs = 60000): boolean {
  const now = Date.now()
  const entry = hits.get(key)
  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs })
    return true // allowed
  }
  entry.count++
  if (entry.count > maxRequests) return false // blocked
  return true
}
