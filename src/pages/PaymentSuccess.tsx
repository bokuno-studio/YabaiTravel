import { Link, useParams } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

function PaymentSuccess() {
  const { lang } = useParams<{ lang: string }>()
  const isEn = lang === 'en'
  const langPrefix = `/${lang || 'ja'}`

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Card className="mx-auto max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-xl">
            {isEn ? 'Payment Successful!' : 'お支払い完了!'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            {isEn
              ? 'Thank you for joining the yabai.travel community. You now have access to community features.'
              : 'yabai.travel コミュニティへのご参加ありがとうございます。コミュニティ機能をご利用いただけるようになりました。'}
          </p>
        </CardContent>
        <CardFooter className="justify-center">
          <Button asChild>
            <Link to={langPrefix}>
              {isEn ? 'Back to Home' : 'ホームに戻る'}
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

export default PaymentSuccess
