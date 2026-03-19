import { Link, useParams } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

function PaymentCancel() {
  const { lang } = useParams<{ lang: string }>()
  const isEn = lang === 'en'
  const langPrefix = `/${lang || 'ja'}`

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Card className="mx-auto max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-xl">
            {isEn ? 'Payment Cancelled' : 'お支払いがキャンセルされました'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            {isEn
              ? 'Your payment was not processed. You can try again anytime.'
              : 'お支払いは処理されませんでした。いつでも再度お試しいただけます。'}
          </p>
        </CardContent>
        <CardFooter className="justify-center gap-3">
          <Button asChild variant="outline">
            <Link to={langPrefix}>
              {isEn ? 'Back to Home' : 'ホームに戻る'}
            </Link>
          </Button>
          <Button asChild>
            <Link to={`${langPrefix}/pricing`}>
              {isEn ? 'Try Again' : 'もう一度試す'}
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

export default PaymentCancel
