import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SquareClient, SquareEnvironment } from 'square'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { ok, badRequest, serverError } from './lib/response'
import { rateLimit } from './lib/rate-limit'
import { logger } from './lib/logger'

const client = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN!,
  environment: SquareEnvironment.Production,
})

const postSchema = z.object({
  mode: z.enum(['donation', 'subscription']),
  amount: z.number().optional(),
  currency: z.string().optional(),
  lang: z.string().optional(),
  email: z.string().email().optional(),
  displayName: z.string().optional(),
  userId: z.string().optional(),
})

/**
 * Find or create a Square customer by email.
 * Returns the customer ID.
 */
async function findOrCreateCustomer(email: string, displayName?: string): Promise<string> {
  // Search for existing customer by email
  const searchResult = await client.customers.search({
    query: {
      filter: {
        emailAddress: { exact: email },
      },
    },
  })

  if (searchResult.customers && searchResult.customers.length > 0) {
    return searchResult.customers[0].id!
  }

  // Create new customer
  const createResult = await client.customers.create({
    idempotencyKey: randomUUID(),
    emailAddress: email,
    givenName: displayName || undefined,
    referenceId: email, // for easy lookup
  })

  return createResult.customer!.id!
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'
    if (!rateLimit(`checkout:${ip}`, 5, 60000)) {
      return res.status(429).json({ error: 'Too many requests' })
    }

    const parsed = postSchema.safeParse(req.body)
    if (!parsed.success) {
      return badRequest(res, 'Validation failed', parsed.error.issues)
    }

    const { mode, amount, currency, lang, email, displayName, userId } = parsed.data
    const langPrefix = lang === 'en' ? '/en' : '/ja'
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://yabai-travel.vercel.app'

    const redirectUrl = `${baseUrl}${langPrefix}/payment/success`
    const locationId = process.env.SQUARE_LOCATION_ID!

    if (mode === 'donation') {
      const unitAmount = amount || 500

      const response = await client.checkout.paymentLinks.create({
        idempotencyKey: randomUUID(),
        quickPay: {
          name: 'yabai.travel 応援',
          priceMoney: {
            amount: BigInt(unitAmount),
            currency: currency === 'usd' ? 'USD' : 'JPY',
          },
          locationId,
        },
        checkoutOptions: {
          redirectUrl,
        },
      })

      return ok(res, { url: response.paymentLink?.url })
    }

    if (mode === 'subscription') {
      const isJpy = lang !== 'en'

      // If email provided, create/find Square customer first
      let squareCustomerId: string | undefined
      if (email) {
        try {
          squareCustomerId = await findOrCreateCustomer(email, displayName)
        } catch (custErr) {
          logger.error({ err: custErr }, 'Failed to create/find Square customer')
          // Continue without customer — payment link still works
        }
      }

      // Build note with metadata for webhook processing
      const note = JSON.stringify({
        type: 'crew_subscription',
        email: email || '',
        userId: userId || '',
        squareCustomerId: squareCustomerId || '',
      })

      const response = await client.checkout.paymentLinks.create({
        idempotencyKey: randomUUID(),
        quickPay: {
          name: isJpy ? 'yabai.travel Crew メンバーシップ' : 'yabai.travel Crew Membership',
          priceMoney: {
            amount: isJpy ? BigInt(1500) : BigInt(1000),
            currency: isJpy ? 'JPY' : 'USD',
          },
          locationId,
        },
        checkoutOptions: {
          redirectUrl,
        },
        paymentNote: note,
      })

      return ok(res, {
        url: response.paymentLink?.url,
        squareCustomerId,
      })
    }

    return badRequest(res, 'Invalid mode')
  } catch (e) {
    logger.error({ err: e }, 'Square checkout error')
    return serverError(res)
  }
}
