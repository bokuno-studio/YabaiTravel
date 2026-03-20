import type { VercelResponse } from '@vercel/node'

export function ok(res: VercelResponse, data: unknown) {
  return res.status(200).json({ data })
}

export function created(res: VercelResponse, data: unknown) {
  return res.status(201).json({ data })
}

export function badRequest(res: VercelResponse, message: string, details?: unknown) {
  return res.status(400).json({ error: message, ...(details ? { details } : {}) })
}

export function unauthorized(res: VercelResponse) {
  return res.status(401).json({ error: 'Unauthorized' })
}

export function notFound(res: VercelResponse, message = 'Not found') {
  return res.status(404).json({ error: message })
}

export function tooManyRequests(res: VercelResponse) {
  return res.status(429).json({ error: 'Too many requests' })
}

export function serverError(res: VercelResponse, message = 'Internal server error') {
  // Never expose internal error details to client
  return res.status(500).json({ error: message })
}
