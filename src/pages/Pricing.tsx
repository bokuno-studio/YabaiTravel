import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { createStripeCheckout, cancelMembership } from '@/lib/stripe'
import { useAuth } from '@/lib/auth'
import { trackPricingView } from '@/lib/analytics'

function Pricing() {
  const { lang } = useParams<{ lang: string }>()
  const isEn = lang === 'en'
  const { user, session, isSupporter, signInWithGoogle } = useAuth()

  const [donationAmount, setDonationAmount] = useState('5')

  useEffect(() => { trackPricingView() }, [])
  const [donationLoading, setDonationLoading] = useState(false)
  const [subscriptionLoading, setSubscriptionLoading] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cancelConfirm, setCancelConfirm] = useState(false)

  const handleDonate = async () => {
    setDonationLoading(true)
    setError(null)
    try {
      const amount = parseInt(donationAmount, 10)
      if (isNaN(amount) || amount < 1) {
        throw new Error(isEn ? 'Please enter a valid amount' : '有効な金額を入力してください')
      }
      // USD: convert to cents
      const unitAmount = amount * 100
      const url = await createStripeCheckout({
        mode: 'donation',
        amount: unitAmount,
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
      const url = await createStripeCheckout({
        mode: 'subscription',
        lang,
        email: user?.email || undefined,
        userId: user?.id,
      })
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setSubscriptionLoading(false)
    }
  }

  const handleCancel = async () => {
    if (!cancelConfirm) {
      setCancelConfirm(true)
      return
    }

    setCancelLoading(true)
    setError(null)
    try {
      const accessToken = session?.access_token
      if (!accessToken) {
        throw new Error(isEn ? 'Not authenticated' : '認証されていません')
      }
      await cancelMembership(accessToken)
      // Reload page to reflect updated membership
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setCancelLoading(false)
      setCancelConfirm(false)
    }
  }

  const supporterFeatures = isEn
    ? [
        'Comment on the feedback board',
        'Submit feature requests from any page',
        'View bug reports',
        'Crew badge on your profile',
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
              <span className="text-lg font-medium">$</span>
              <Input
                type="number"
                min="1"
                value={donationAmount}
                onChange={(e) => setDonationAmount(e.target.value)}
                className="w-32"
                placeholder={isEn ? 'Amount' : '金額'}
              />
              <span className="text-sm text-muted-foreground">USD</span>
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

        {/* Crew Membership Card */}
        <Card className="flex flex-col border-primary/50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle className="text-xl">
                {isEn ? 'Crew Membership' : 'Crew'}
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
              <span className="text-4xl font-bold">$10</span>
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
            {isSupporter ? (
              <div className="w-full space-y-3">
                <div className="text-center py-2">
                  <Badge className="bg-green-100 text-green-800 border-green-200 text-sm px-3 py-1">
                    &#10003; {isEn ? "You're Crew!" : 'Crewメンバーです'}
                  </Badge>
                </div>
                {cancelConfirm ? (
                  <div className="space-y-2">
                    <p className="text-sm text-center text-muted-foreground">
                      {isEn
                        ? 'Are you sure? You can continue using Crew benefits until the end of the current billing period.'
                        : '本当にキャンセルしますか？現在の請求期間の終了まで引き続きCrew特典をご利用いただけます。'}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        size="sm"
                        variant="destructive"
                        onClick={handleCancel}
                        disabled={cancelLoading}
                      >
                        {cancelLoading
                          ? (isEn ? 'Cancelling...' : 'キャンセル中...')
                          : (isEn ? 'Yes, cancel' : 'はい、キャンセル')}
                      </Button>
                      <Button
                        className="flex-1"
                        size="sm"
                        variant="outline"
                        onClick={() => setCancelConfirm(false)}
                        disabled={cancelLoading}
                      >
                        {isEn ? 'Keep membership' : '継続する'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    className="w-full"
                    size="sm"
                    variant="ghost"
                    onClick={handleCancel}
                  >
                    {isEn ? 'Cancel membership' : 'メンバーシップをキャンセル'}
                  </Button>
                )}
              </div>
            ) : !user ? (
              <>
                <Button
                  className="w-full"
                  size="lg"
                  onClick={signInWithGoogle}
                >
                  {isEn ? 'Sign in with Google to join Crew' : 'Googleでログインして Crew になる'}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  {isEn
                    ? 'Sign in first, then subscribe to become Crew.'
                    : 'まずGoogleでログインし、その後サブスクリプション登録に進みます。'}
                </p>
              </>
            ) : (
              <>
                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleSubscribe}
                  disabled={subscriptionLoading}
                >
                  {subscriptionLoading
                    ? (isEn ? 'Redirecting...' : 'リダイレクト中...')
                    : (isEn ? 'Become Crew' : 'Crewになる')}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  {isEn
                    ? 'You will be redirected to Stripe for secure payment.'
                    : 'Stripe の安全な決済ページにリダイレクトされます。'}
                </p>
              </>
            )}
          </CardFooter>
        </Card>
      </div>

      <div className="mt-8 text-center">
        <Link
          to={`/${lang || 'ja'}/legal`}
          className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
        >
          {isEn ? 'Legal Notice (Specified Commercial Transactions Act)' : '特定商取引法に基づく表記'}
        </Link>
      </div>
    </div>
  )
}

export default Pricing
