import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { createCheckout, cancelMembership } from '@/lib/payment'
import { useAuth } from '@/lib/auth'
import { trackPricingView, trackCtaClick } from '@/lib/analytics'
import { useScrollDepth } from '@/hooks/useScrollDepth'

function Pricing() {
  const { lang } = useParams<{ lang: string }>()
  const isEn = lang === 'en'
  const { user, session, isSupporter, signInWithGoogle } = useAuth()

  useScrollDepth('pricing')
  const [donationAmount, setDonationAmount] = useState('500')
  const [donationLoading, setDonationLoading] = useState(false)
  const [subscriptionLoading, setSubscriptionLoading] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingCrewCheckout, setPendingCrewCheckout] = useState(false)
  const [showCrewConfirm, setShowCrewConfirm] = useState(false)

  useEffect(() => { trackPricingView() }, [])

  useEffect(() => {
    if (user && pendingCrewCheckout) {
      setPendingCrewCheckout(false)
      setShowCrewConfirm(true)
    }
  }, [user, pendingCrewCheckout])

  const handleDonate = async () => {
    setDonationLoading(true)
    setError(null)
    try {
      const amount = parseInt(donationAmount, 10)
      if (isNaN(amount) || amount < 1) {
        throw new Error(isEn ? 'Please enter a valid amount' : '有効な金額を入力してください')
      }
      // JPY: amount is already in yen (no cents)
      const unitAmount = amount
      const url = await createCheckout({
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
      const url = await createCheckout({
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
    }
  }

  const supporterFeatures = isEn
    ? [
        'Unlimited race detail viewing',
        'Comment on the feedback board',
        'Submit feature requests from any page',
        'View bug reports',
        'Crew badge on your profile',
      ]
    : [
        'レース詳細の無制限閲覧',
        '要望掲示板コメント権',
        '各ページで要望投稿',
        'バグレポート閲覧',
        'メンバーバッジ表示',
      ]

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight">
          {isEn ? 'Plans' : 'プラン'}
        </h1>
        <p className="mt-3 text-muted-foreground">
          {isEn
            ? 'Find races, plan trips — smarter.'
            : 'レース探しと遠征計画を、もっとスマートに。'}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Badge variant="secondary">
            {isEn ? '39+ Sources Auto-Collected' : '39+ ソース自動収集'}
          </Badge>
          <Badge variant="secondary">
            {isEn ? 'Tokyo-based Access Time' : '東京起点アクセス時間計算'}
          </Badge>
          <Badge variant="secondary">
            {isEn ? 'Day-trip Feasibility' : '日帰り判定'}
          </Badge>
        </div>
      </div>

      {error && (
        <div className="mb-6 text-center">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Free/Crew Comparison Table */}
      <div className="mb-10 overflow-x-auto">
        <table className="w-full border-collapse border border-border rounded-lg">
          <thead>
            <tr className="bg-muted">
              <th className="border border-border px-4 py-3 text-left font-medium">
                {isEn ? 'Features' : '機能'}
              </th>
              <th className="border border-border px-4 py-3 text-center font-medium">
                Free
              </th>
              <th className="border border-border px-4 py-3 text-center font-medium">
                Crew <span className="text-sm">(¥500/月)</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-border px-4 py-3">
                {isEn ? 'Race search and list viewing' : 'レース検索・一覧閲覧'}
              </td>
              <td className="border border-border px-4 py-3 text-center">○</td>
              <td className="border border-border px-4 py-3 text-center">○</td>
            </tr>
            <tr className="bg-muted/30">
              <td className="border border-border px-4 py-3">
                {isEn ? 'Access time and day-trip feasibility' : '交通アクセス・日帰り判定'}
              </td>
              <td className="border border-border px-4 py-3 text-center">○</td>
              <td className="border border-border px-4 py-3 text-center">○</td>
            </tr>
            <tr className="bg-muted/30">
              <td className="border border-border px-4 py-3">
                {isEn ? 'Save favorite races' : 'お気に入り保存'}
              </td>
              <td className="border border-border px-4 py-3 text-center">—</td>
              <td className="border border-border px-4 py-3 text-center">○</td>
            </tr>
            <tr>
              <td className="border border-border px-4 py-3">
                {isEn ? 'Feedback board comments' : '要望掲示板コメント'}
              </td>
              <td className="border border-border px-4 py-3 text-center">—</td>
              <td className="border border-border px-4 py-3 text-center">○</td>
            </tr>
            <tr className="bg-muted/30">
              <td className="border border-border px-4 py-3">
                {isEn ? 'Crew badge' : 'Crewバッジ'}
              </td>
              <td className="border border-border px-4 py-3 text-center">—</td>
              <td className="border border-border px-4 py-3 text-center">○</td>
            </tr>
          </tbody>
        </table>
      </div>

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
              <span className="text-lg font-medium">¥</span>
              <Input
                type="number"
                min="1"
                value={donationAmount}
                onChange={(e) => setDonationAmount(e.target.value)}
                className="w-32"
                placeholder={isEn ? 'Amount' : '金額'}
              />
              <span className="text-sm text-muted-foreground">JPY</span>
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
                ? 'You will be redirected to Square for secure payment.'
                : 'Square の安全な決済ページにリダイレクトされます。'}
            </p>
          </CardFooter>
        </Card>

        {/* Crew Membership Card */}
        <Card className="flex flex-col border-primary/50">
          <CardHeader>
            <CardTitle className="text-xl">
              {isEn ? 'Crew Membership' : 'Crew'}
            </CardTitle>
            <CardDescription>
              {isEn ? 'Monthly subscription' : '月額プラン'}
            </CardDescription>
          </CardHeader>

          <CardContent className="flex-1">
            <div className="mb-6">
              <span className="text-4xl font-bold">¥500</span>
              <span className="text-muted-foreground">
                {isEn ? ' /month (tax included)' : ' /月（税込）'}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              {isEn
                ? 'Your subscription renews automatically each month. You can cancel anytime from your account settings.'
                : 'サブスクリプションは毎月自動更新されます。アカウント設定からいつでもキャンセルできます。'}
            </p>

            <ul className="space-y-3 mb-6">
              {supporterFeatures.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <span className="mt-0.5 text-green-600">&#10003;</span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            {/* What you can do */}
            <div className="mb-4 rounded-lg bg-muted/40 p-3">
              <h3 className="text-sm font-semibold mb-2 text-foreground">
                {isEn ? 'What you can do as Crew' : 'Crewでできること'}
              </h3>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>{isEn ? '→ Save races to your personal calendar' : '→ レースをマイカレンダーに保存'}</li>
                <li>{isEn ? '→ Post feature requests and bug reports' : '→ 要望・バグ報告を投稿'}</li>
                <li>{isEn ? '→ Show your Crew badge on the community board' : '→ 掲示板にCrew バッジを表示'}</li>
                <li>{isEn ? '→ Support keeping this service free for all' : '→ サービスの無料維持を支援'}</li>
              </ul>
            </div>
          </CardContent>

          {showCrewConfirm && (
            <div className="mx-6 mb-4 rounded-lg border border-primary/30 bg-primary/5 p-4 text-center space-y-3">
              <p className="text-sm font-medium">
                {isEn
                  ? "You're signed in. Ready to subscribe to Crew for ¥500/mo?"
                  : 'ログインしました。Crew（¥500/月）の決済に進みますか？'}
              </p>
              <div className="flex gap-2 justify-center">
                <Button
                  onClick={() => { setShowCrewConfirm(false); handleSubscribe() }}
                  size="sm"
                >
                  {isEn ? 'Continue to payment' : '決済に進む'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCrewConfirm(false)}
                >
                  {isEn ? 'Cancel' : 'キャンセル'}
                </Button>
              </div>
            </div>
          )}

          <CardFooter className="flex-col gap-3">
            {isSupporter ? (
              <div className="w-full space-y-3">
                <div className="text-center py-2">
                  <Badge className="bg-green-100 text-green-800 border-green-200 text-sm px-3 py-1">
                    &#10003; {isEn ? "You're Crew!" : 'Crewメンバーです'}
                  </Badge>
                </div>
                <Button
                  className="w-full"
                  size="sm"
                  variant="ghost"
                  onClick={handleCancel}
                  disabled={cancelLoading}
                >
                  {cancelLoading
                    ? (isEn ? 'Cancelling...' : 'キャンセル中...')
                    : (isEn ? 'Cancel membership' : 'メンバーシップをキャンセル')}
                </Button>
              </div>
            ) : !user ? (
              <>
                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => { trackCtaClick('google_login', '/pricing'); setPendingCrewCheckout(true); signInWithGoogle() }}
                >
                  {isEn ? 'Sign in with Google to get started' : 'Googleでログインして登録する'}
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
                  onClick={() => { trackCtaClick('signup_pricing', '/pricing'); handleSubscribe() }}
                  disabled={subscriptionLoading}
                >
                  {subscriptionLoading
                    ? (isEn ? 'Redirecting...' : 'リダイレクト中...')
                    : (isEn ? 'Become Crew' : 'Crewになる')}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  {isEn
                    ? 'You will be redirected to Square for secure payment.'
                    : 'Square の安全な決済ページにリダイレクトされます。'}
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
