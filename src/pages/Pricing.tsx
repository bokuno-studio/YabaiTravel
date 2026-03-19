import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createCheckoutSession } from '@/lib/stripe'

function Pricing() {
  const { lang } = useParams<{ lang: string }>()
  const isEn = lang === 'en'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubscribe = async () => {
    setLoading(true)
    setError(null)
    try {
      const url = await createCheckoutSession()
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setLoading(false)
    }
  }

  const features = isEn
    ? ['Community board access', 'Propose changes to race info', 'Support the project']
    : ['コミュニティ掲示板アクセス', 'レース情報の変更提案機能', 'プロジェクトの応援']

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight">
          {isEn ? 'Community Membership' : 'コミュニティメンバーシップ'}
        </h1>
        <p className="mt-3 text-muted-foreground">
          {isEn
            ? 'Join the yabai.travel community and help improve race information.'
            : 'yabai.travel コミュニティに参加して、レース情報をみんなで改善しましょう。'}
        </p>
      </div>

      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">
            {isEn ? 'Community Member' : 'コミュニティメンバー'}
          </CardTitle>
          <CardDescription>
            {isEn ? 'Monthly subscription' : '月額プラン'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="mb-6">
            <span className="text-4xl font-bold">&yen;100</span>
            <span className="text-muted-foreground">
              {isEn ? ' /month' : ' /月'}
            </span>
          </div>

          <ul className="space-y-3">
            {features.map((feature) => (
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
            disabled={loading}
          >
            {loading
              ? (isEn ? 'Redirecting...' : 'リダイレクト中...')
              : (isEn ? 'Subscribe' : '登録する')}
          </Button>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <p className="text-xs text-muted-foreground text-center">
            {isEn
              ? 'You will be redirected to Stripe for secure payment.'
              : 'Stripe の安全な決済ページにリダイレクトされます。'}
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}

export default Pricing
