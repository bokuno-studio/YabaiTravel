import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SquareClient, SquareEnvironment } from 'square'
import { randomUUID } from 'crypto'

const client = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN!,
  environment: SquareEnvironment.Production,
})

