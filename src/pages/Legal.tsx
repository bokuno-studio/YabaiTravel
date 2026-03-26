import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function Legal() {
  const { lang } = useParams<{ lang: string }>()
  const isEn = lang === 'en'
  const langPrefix = `/${lang || 'ja'}`

  const [email, setEmail] = useState('')
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), content: content.trim() }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to send inquiry')
      }

      setSubmitted(true)
      setEmail('')
      setContent('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <title>
        {isEn
          ? 'Legal Notice | yabai.travel'
          : '特定商取引法に基づく表記 | yabai.travel'}
      </title>
      <meta
        name="description"
        content={
          isEn
            ? 'Legal notice based on the Specified Commercial Transactions Act and contact form for yabai.travel.'
            : 'yabai.travel の特定商取引法に基づく表記とお問い合わせフォーム。'
        }
      />

      <div className="mx-auto max-w-3xl px-4 py-12">
        {/* Legal Notice Section */}
        <h1 className="text-2xl font-bold tracking-tight mb-8">
          {isEn
            ? 'Legal Notice (Specified Commercial Transactions Act)'
            : '特定商取引法に基づく表記'}
        </h1>

        <div className="space-y-6 mb-12">
          <LegalRow
            label={isEn ? 'Business Name' : '販売業者'}
            value="flexplore"
          />
          <LegalRow
            label={isEn ? 'Products & Services' : '商品・サービスの内容'}
            value={
              isEn
                ? 'yabai.travel — A search and trip planning service for endurance races (trail running, obstacle course racing, etc.) in Japan. The paid "Crew Membership" plan provides additional features such as favorites, comments, and more.'
                : 'yabai.travel — エンデュランスレース（トレイルランニング、障害物レース等）の検索・旅行計画サービス。有料プラン「Crew メンバーシップ」では、お気に入り保存・コメント投稿等の追加機能をご利用いただけます。'
            }
          />
          <LegalRow
            label={isEn ? 'Representative' : '代表者'}
            value={
              isEn
                ? 'Disclosed without delay upon request.'
                : '請求があった場合に遅滞なく開示いたします'
            }
          />
          <LegalRow
            label={isEn ? 'Address' : '所在地'}
            value={
              isEn
                ? 'Disclosed without delay upon request.'
                : '請求があった場合に遅滞なく開示いたします'
            }
          />
          <LegalRow
            label={isEn ? 'Contact' : '連絡先'}
            value={
              isEn
                ? 'support@yabai.travel (You may also use the contact form below.)'
                : 'support@yabai.travel（お問い合わせフォームもご利用いただけます）'
            }
          />
          <LegalRow
            label={isEn ? 'Phone' : '電話番号'}
            value={
              isEn
                ? 'Disclosed without delay upon request.'
                : '請求があった場合に遅滞なく開示いたします'
            }
          />

          <div className="border-t border-border my-6" />

          <LegalRow
            label={isEn ? 'Pricing' : '販売価格'}
            value={
              isEn ? (
                <ul className="list-disc pl-5 space-y-1">
                  <li>Crew Membership: $10/month (tax included)</li>
                  <li>Comment: $1 per comment (tax included)</li>
                  <li>One-time Donation: Any amount (USD)</li>
                </ul>
              ) : (
                <ul className="list-disc pl-5 space-y-1">
                  <li>Crew メンバーシップ: $10/月（税込）</li>
                  <li>コメント: $1/件（税込）</li>
                  <li>単発寄付: 任意の金額（USD）</li>
                </ul>
              )
            }
          />
          <LegalRow
            label={isEn ? 'Payment Method' : '支払方法'}
            value={
              isEn
                ? 'Credit card (via Square)'
                : 'クレジットカード決済（Square 経由）'
            }
          />
          <LegalRow
            label={isEn ? 'Payment Timing' : '支払時期'}
            value={
              isEn
                ? 'Charged immediately upon completing the purchase. Subscriptions are charged automatically upon each monthly renewal.'
                : '購入手続き完了時に即時決済。サブスクリプションは毎月自動更新時に決済されます。'
            }
          />
          <LegalRow
            label={isEn ? 'Delivery' : '商品の引渡時期'}
            value={
              isEn
                ? 'Service is available immediately after payment is completed.'
                : '決済完了後、即時にサービスをご利用いただけます'
            }
          />
          <LegalRow
            label={isEn ? 'Returns & Cancellation' : '返品・キャンセル'}
            value={
              isEn ? (
                <ul className="list-disc pl-5 space-y-1">
                  <li>No returns or refunds are accepted as this is a digital service.</li>
                  <li>
                    Crew Membership can be cancelled at any time from the{' '}
                    <Link to={`${langPrefix}/pricing`} className="text-primary underline">
                      Pricing page
                    </Link>.
                  </li>
                  <li>After cancellation, you may continue using the service for the remainder of the billing period.</li>
                </ul>
              ) : (
                <ul className="list-disc pl-5 space-y-1">
                  <li>デジタルサービスのため、返品・返金はお受けしておりません。</li>
                  <li>
                    Crew メンバーシップは、
                    <Link to={`${langPrefix}/pricing`} className="text-primary underline">
                      Pricing ページ
                    </Link>
                    からいつでもキャンセル可能です。
                  </li>
                  <li>キャンセル後、残りの期間は引き続きサービスをご利用いただけます。</li>
                </ul>
              )
            }
          />
          <LegalRow
            label={isEn ? 'Special Conditions' : '特別な販売条件'}
            value={
              isEn
                ? 'Crew Membership is a monthly subscription that renews and charges automatically each month unless cancelled. Prices are in USD; the amount charged in your local currency may vary depending on the exchange rate.'
                : 'Crew メンバーシップは月額サブスクリプションです。キャンセルしない限り毎月自動的に更新・決済されます。価格は USD 建てであり、為替レートにより日本円での請求額が変動する場合があります。'
            }
          />
        </div>

        {/* Separator */}
        <div className="border-t border-border my-10" />

        {/* Contact Form Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              {isEn ? 'Contact Us' : 'お問い合わせ'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {submitted ? (
              <div className="rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4 text-center">
                <p className="text-green-800 dark:text-green-200 font-medium">
                  {isEn
                    ? 'Thank you! Your inquiry has been sent successfully.'
                    : 'お問い合わせを送信しました。ありがとうございます。'}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3"
                  onClick={() => setSubmitted(false)}
                >
                  {isEn ? 'Send another inquiry' : '別のお問い合わせを送る'}
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="inquiry-email" className="block text-sm font-medium mb-1.5">
                    {isEn ? 'Email' : 'メールアドレス'}
                  </label>
                  <Input
                    id="inquiry-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={isEn ? 'your@email.com' : 'your@email.com'}
                  />
                </div>
                <div>
                  <label htmlFor="inquiry-content" className="block text-sm font-medium mb-1.5">
                    {isEn ? 'Message' : 'お問い合わせ内容'}
                  </label>
                  <textarea
                    id="inquiry-content"
                    required
                    rows={5}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm resize-y min-h-[120px]"
                    placeholder={
                      isEn
                        ? 'Please describe your inquiry...'
                        : 'お問い合わせ内容をご記入ください...'
                    }
                  />
                </div>

                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}

                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting
                    ? (isEn ? 'Sending...' : '送信中...')
                    : (isEn ? 'Send' : '送信')}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function LegalRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-1 sm:gap-4">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  )
}

export default Legal
