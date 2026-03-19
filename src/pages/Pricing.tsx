import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { createCheckoutSession } from '@/lib/stripe'

function Pricing() {
  const { lang } = useParams<{ lang: string }>()
  const isEn = lang === 'en'

  const [donationAmount, setDonationAmount] = useState(isEn ? '5' : '500')
  const [donationLoading, setDonationLoading] = useState(false)
  const [subscriptionLoading, setSubscriptionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDonate = async () => {
    setDonationLoading(true)
    setError(null)
    try {
      const amount = parseInt(donationAmount, 10)
      if (isNaN(amount) || amount < 1) {
        throw new Error(isEn ? 'Please enter a valid amount' : '有効な金額を入力してください')
      }
      const currency = isEn ? 'usd' : 'jpy'
      // For JPY, amount is already in the smallest unit; for USD, convert to cents
      const unitAmount = currency === 'usd' ? amount * 100 : amount
      const url = await createCheckoutSession({
        mode: 'donation',
        amount: unitAmount,
        currency,
        lang,
      })
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setDonationLoading(false)
    }
  }

  const handleSubscribe = async () => {
    setSubscriptionLoading(true)
    setError(null)
    try {
      const url = await createCheckoutSession({
        mode: 'subscription',
        lang,
      })
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setSubscriptionLoading(false)
    }
  }

  const supporterFeatures = isEn
    ? [
        'Comment on the feedback board',
        'Submit feature requests from any page',
        'View bug reports',
        'Supporter badge on your profile',
      ]
    : [
        '要望掲示板コメント権',
        '各ページで要望投稿',
        'バグレポート閲覧',
        'メンバーバッジ表示',
      ]

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight">
          {isEn ? 'Support yabai.travel' : 'yabai.travel を応援'}
        </h1>
        <p className="mt-3 text-muted-foreground">
          {isEn
            ? 'Help us keep improving race information for endurance athletes.'
            : 'エンデュランス系大会の情報を、みんなでもっと良くしていきましょう。'}
        </p>
      </div>

      {error && (
        <div className="mb-6 text-center">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* One-time Donation Card */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-xl">
              {isEn ? 'One-time Donation' : '単発寄付'}
            </CardTitle>
            <CardDescription>
              {isEn ? 'Support with any amount' : '好きな金額で応援'}
            </CardDescription>
          </CardHeader>

          <CardContent className="flex-1">
            <p className="mb-4 text-sm text-muted-foreground">
              {isEn
                ? 'Your donation helps cover hosting and API costs. Every bit counts!'
                : 'サーバー費用やAPI費用の負担を助けていただけます。少額でも大歓迎です！'}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-lg font-medium">{isEn ? '$' : '\u00a5'}</span>
              <Input
                type="number"
                min="1"
                value={donationAmount}
                onChange={(e) => setDonationAmount(e.target.value)}
                className="w-32"
                placeholder={isEn ? 'Amount' : '金額'}
              />
              <span className="text-sm text-muted-foreground">
                {isEn ? 'USD' : 'JPY'}
              </span>
            </div>
          </CardContent>

          <CardFooter className="flex-col gap-3">
            <Button
              className="w-full"
              size="lg"
              variant="outline"
              onClick={handleDonate}
              disabled={donationLoading}
            >
              {donationLoading
                ? (isEn ? 'Redirecting...' : 'リダイレクト中...')
                : (isEn ? 'Donate' : '寄付する')}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              {isEn
                ? 'You will be redirected to Stripe for secure payment.'
                : 'Stripe の安全な決済ページにリダイレクトされます。'}
            </p>
          </CardFooter>
        </Card>

        {/* Supporter Membership Card */}
        <Card className="flex flex-col border-primary/50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle className="text-xl">
                {isEn ? 'Supporter Membership' : '応援メンバー'}
              </CardTitle>
              <Badge variant="default">
                {isEn ? 'Recommended' : 'おすすめ'}
              </Badge>
            </div>
            <CardDescription>
              {isEn ? 'Monthly subscription' : '月額プラン'}
            </CardDescription>
          </CardHeader>

          <CardContent className="flex-1">
            <div className="mb-6">
              <span className="text-4xl font-bold">
                {isEn ? '$10' : '\u00a51,500'}
              </span>
              <span className="text-muted-foreground">
                {isEn ? ' /month' : ' /月'}
              </span>
            </div>

            <ul className="space-y-3">
              {supporterFeatures.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <span className="mt-0.5 text-green-600">&#10003;</span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </CardContent>

          <CardFooter className="flex-col gap-3">
            <Button
              className="w-full"
              size="lg"
              onClick={handleSubscribe}
              disabled={subscriptionLoading}
            >
              {subscriptionLoading
                ? (isEn ? 'Redirecting...' : 'リダイレクト中...')
                : (isEn ? 'Become a Supporter' : 'メンバーになる')}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              {isEn
                ? 'You will be redirected to Stripe for secure payment.'
                : 'Stripe の安全な決済ページにリダイレクトされます。'}
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}

export default Pricing
