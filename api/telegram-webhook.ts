import type { VercelRequest, VercelResponse } from '@vercel/node'
import { fetchWithTimeout } from './lib/fetch-with-timeout'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true })

  const { message } = req.body || {}
  if (!message?.text) return res.status(200).json({ ok: true })

  const chatId = String(message.chat?.id)
  const allowedChatId = process.env.TELEGRAM_CHAT_ID
  if (chatId !== allowedChatId) return res.status(200).json({ ok: true })

  const text = message.text.trim().toLowerCase()

  if (text === 'レポート' || text === '/report') {
    await triggerReport(chatId)
  }

  return res.status(200).json({ ok: true })
}

async function triggerReport(chatId: string) {
  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPOSITORY || 'bokunon/YabaiTravel'

  if (token) {
    await fetchWithTimeout(
      `https://api.github.com/repos/${repo}/actions/workflows/crawl-daily-report.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
        body: JSON.stringify({ ref: 'main' }),
        timeout: 10000,
      }
    )

    // Send acknowledgment
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    if (botToken) {
      await fetchWithTimeout(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: '\u{1F4CA} レポート生成をトリガーしました。数分後に届きます。',
        }),
        timeout: 10000,
      })
    }
  }
}
