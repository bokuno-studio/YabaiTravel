/**
 * Anthropic Batch API ユーティリティ
 * enrich スクリプトの --batch モードで使用
 *
 * Batch API は入力・出力ともに 50% 割引（最大24時間待ち）
 */

/**
 * バッチリクエストを作成して送信
 * @param {import('@anthropic-ai/sdk').default} anthropic - Anthropic client
 * @param {Array<{custom_id: string, systemPrompt: string, userContent: string, maxTokens?: number}>} requests
 * @returns {Promise<string>} batch ID
 */
export async function createBatch(anthropic, requests) {
  if (requests.length === 0) {
    throw new Error('No requests to batch')
  }

  const batchRequests = requests.map((req) => ({
    custom_id: req.custom_id,
    params: {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: req.maxTokens || 2048,
      system: [{ type: 'text', text: req.systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: req.userContent }],
    },
  }))

  const batch = await anthropic.messages.batches.create({ requests: batchRequests })
  console.log(`[batch] Created batch ${batch.id} with ${requests.length} requests`)
  return batch.id
}

/**
 * バッチ完了をポーリングで待機
 * @param {import('@anthropic-ai/sdk').default} anthropic
 * @param {string} batchId
 * @param {number} pollIntervalMs - ポーリング間隔（デフォルト: 30秒）
 * @param {number} maxWaitMs - 最大待機時間（デフォルト: 2時間）
 * @returns {Promise<import('@anthropic-ai/sdk').MessageBatch>}
 */
export async function waitForBatch(anthropic, batchId, pollIntervalMs = 30000, maxWaitMs = 2 * 60 * 60 * 1000) {
  const startTime = Date.now()
  let lastStatus = ''
  console.log(`[batch] waitForBatch starting for ${batchId}, polling every ${pollIntervalMs}ms, max wait ${maxWaitMs / 1000}s`)

  while (true) {
    try {
      const batch = await anthropic.messages.batches.retrieve(batchId)

    if (batch.processing_status !== lastStatus) {
      lastStatus = batch.processing_status
      const elapsed = Math.round((Date.now() - startTime) / 1000)
      const counts = batch.request_counts || {}
      console.log(
        `[batch] ${batchId} status=${batch.processing_status} ` +
        `succeeded=${counts.succeeded || 0} errored=${counts.errored || 0} ` +
        `expired=${counts.expired || 0} canceled=${counts.canceled || 0} ` +
        `(${elapsed}s elapsed)`
      )
    }

      if (batch.processing_status === 'ended') {
        console.log(`[batch] Batch ${batchId} ended, returning results`)
        return batch
      }

      if (Date.now() - startTime > maxWaitMs) {
        throw new Error(`Batch ${batchId} timed out after ${maxWaitMs / 1000}s`)
      }

      await new Promise((r) => setTimeout(r, pollIntervalMs))
    } catch (err) {
      console.error(`[batch] Error polling batch ${batchId}:`, err.message)
      throw err
    }
  }
}

/**
 * バッチ結果を取得して Map<custom_id, result> として返す
 * @param {import('@anthropic-ai/sdk').default} anthropic
 * @param {string} batchId
 * @returns {Promise<Map<string, {success: boolean, parsed?: object, usage?: object, error?: string}>>}
 */
export async function getBatchResults(anthropic, batchId) {
  const results = new Map()
  const decoder = await anthropic.messages.batches.results(batchId)

  for await (const item of decoder) {
    const customId = item.custom_id

    if (item.result.type === 'succeeded') {
      const msg = item.result.message
      const text = msg.content[0]?.type === 'text' ? msg.content[0].text : ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)

      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0])
          results.set(customId, {
            success: true,
            parsed: { ...parsed, _usage: msg.usage },
            usage: msg.usage,
          })
        } catch (e) {
          results.set(customId, {
            success: false,
            error: `JSON parse error: ${e.message}`,
          })
        }
      } else {
        results.set(customId, {
          success: false,
          error: 'No JSON found in response',
        })
      }
    } else if (item.result.type === 'errored') {
      results.set(customId, {
        success: false,
        error: `API error: ${item.result.error?.message || 'unknown'}`,
      })
    } else if (item.result.type === 'expired') {
      results.set(customId, {
        success: false,
        error: 'Request expired (24h timeout)',
      })
    } else if (item.result.type === 'canceled') {
      results.set(customId, {
        success: false,
        error: 'Request canceled',
      })
    }
  }

  return results
}

/**
 * バッチを作成→待機→結果取得を一括実行
 * @param {import('@anthropic-ai/sdk').default} anthropic
 * @param {Array<{custom_id: string, systemPrompt: string, userContent: string, maxTokens?: number}>} requests
 * @param {object} opts
 * @param {number} opts.pollIntervalMs
 * @param {number} opts.maxWaitMs
 * @returns {Promise<Map<string, {success: boolean, parsed?: object, usage?: object, error?: string}>>}
 */
export async function runBatch(anthropic, requests, opts = {}) {
  const { pollIntervalMs = 30000, maxWaitMs = 2 * 60 * 60 * 1000 } = opts

  const batchId = await createBatch(anthropic, requests)
  await waitForBatch(anthropic, batchId, pollIntervalMs, maxWaitMs)
  const results = await getBatchResults(anthropic, batchId)

  const succeeded = [...results.values()].filter((r) => r.success).length
  const failed = [...results.values()].filter((r) => !r.success).length
  console.log(`[batch] Complete: ${succeeded} succeeded, ${failed} failed out of ${requests.length} requests`)

  return results
}
