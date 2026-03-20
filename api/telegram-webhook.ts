import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true })

  const { message } = req.body || {}
  if (!message?.text) return res.status(200).json({ ok: true })

  const chatId = String(message.chat?.id)
  const allowedChatId = process.env.TELEGRAM_CHAT_ID
  if (chatId !== allowedChatId) return res.status(200).json({ ok: true })

  const text = message.text.trim().toLowerCase()

  if (text === 'レポート' || text === '/report') {
    await generateAndSendReport(chatId)
  }

  return res.status(200).json({ ok: true })
}

async function generateAndSendReport(chatId: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) return

  try {
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { db: { schema: 'yabai_travel' } }
    )

    // Collect stats
    const [
      { count: totalEvents },
      { count: totalCategories },
      { count: enrichedEvents },
      { count: enrichedCategories },
      { count: accessRoutes },
      { count: accommodations },
    ] = await Promise.all([
      supabase.from('events').select('id', { count: 'exact', head: true }),
      supabase.from('categories').select('id', { count: 'exact', head: true }),
      supabase.from('events').select('id', { count: 'exact', head: true }).not('collected_at', 'is', null),
      supabase.from('categories').select('id', { count: 'exact', head: true }).not('entry_fee', 'is', null),
      supabase.from('access_routes').select('event_id', { count: 'exact', head: true }),
      supabase.from('accommodations').select('event_id', { count: 'exact', head: true }),
    ])

    const te = totalEvents ?? 0
    const tc = totalCategories ?? 0
    const ee = enrichedEvents ?? 0
    const ec = enrichedCategories ?? 0
    const ar = Math.floor((accessRoutes ?? 0) / 2) // 2 records per event (outbound+return)
    const ac = accommodations ?? 0

    const pct = (done: number, total: number) => total > 0 ? (done / total * 100).toFixed(1) + '%' : '0%'

    const report = `<pre>📊 オンデマンドレポート

■ 全体
  レース: ${te}  カテゴリ: ${tc}

■ Enrich 進捗
  基本情報: ${ee}/${te} (${pct(ee, te)})
  カテゴリ: ${ec}/${tc} (${pct(ec, tc)})
  アクセス: ${ar}/${ee} (${pct(ar, ee)})
  宿泊:     ${ac}/${ee} (${pct(ac, ee)})

■ 未処理: ${te - ee}件
</pre>`

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: report, parse_mode: 'HTML' }),
    })
  } catch (err) {
    console.error('Report generation failed:', err)
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: 'レポート生成に失敗しました' }),
    })
  }
}
