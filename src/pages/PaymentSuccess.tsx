import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

function PaymentSuccess() {
  const { lang } = useParams<{ lang: string }>()
  const [searchParams] = useSearchParams()
  const isEn = lang === 'en'
  const langPrefix = `/${lang || 'ja'}`
  const paymentType = searchParams.get('type') || 'crew_subscription'

  const getPageTitle = () => {
    switch (paymentType) {
      case 'donation':
        return isEn ? 'Thank you for your support | yabai.travel' : 'ご支援ありがとうございます | yabai.travel'
      case 'comment':
        return isEn ? 'Payment Successful | yabai.travel' : 'お支払い完了 | yabai.travel'
      case 'crew_subscription':
      default:
        return isEn ? 'Payment Successful | yabai.travel' : 'お支払い完了 | yabai.travel'
    }
  }

  const getCardTitle = () => {
    switch (paymentType) {
      case 'donation':
        return isEn ? 'Thank you for your support!' : 'ご支援ありがとうございます！'
      case 'comment':
        return isEn ? 'Payment Successful!' : '決済完了!'
      case 'crew_subscription':
      default:
        return isEn ? 'Payment Successful!' : 'お支払い完了!'
    }
  }

  const getMessage = () => {
    switch (paymentType) {
      case 'donation':
        return isEn
          ? 'Thank you for your support. Your donation goes to server and API costs.'
          : 'ご支援ありがとうございます。いただいたご寄付はサーバー費用・API費用に充てられます。'
      case 'comment':
        return isEn
          ? 'Your payment was successful. Please check your comment submission.'
          : 'コメントの決済が完了しました。投稿内容を確認してください。'
      case 'crew_subscription':
      default:
        return isEn
          ? 'Thank you for joining the yabai.travel community. You now have access to community features.'
          : 'yabai.travel コミュニティへのご参加ありがとうございます。コミュニティ機能をご利用いただけるようになりました。'
    }
  }

  const getDescription = () => {
    switch (paymentType) {
      case 'donation':
        return isEn
          ? 'Thank you for your support. Your donation goes to server and API costs.'
          : 'ご支援ありがとうございます。いただいたご寄付はサーバー費用・API費用に充てられます。'
      case 'comment':
        return isEn
          ? 'Payment successful. Your comment will be posted.'
          : 'お支払い完了。コメントが投稿されます。'
      case 'crew_subscription':
      default:
        return isEn
          ? 'Payment successful. Welcome to the yabai.travel community.'
          : 'お支払い完了。yabai.travel コミュニティへようこそ。'
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <title>{getPageTitle()}</title>
      <meta name="description" content={getDescription()} />
      <Card className="mx-auto max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-xl">
            {getCardTitle()}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            {getMessage()}
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
