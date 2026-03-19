import { useParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'

function Feedback() {
  const { lang } = useParams<{ lang: string }>()
  const isEn = lang === 'en'

  return (
    <>
      <Helmet>
        <title>{isEn ? 'Feedback | yabai.travel' : '要望・フィードバック | yabai.travel'}</title>
        <meta
          name="description"
          content={
            isEn
              ? 'Send us your feedback, bug reports and feature requests.'
              : 'バグ報告・ご要望・機能リクエストをお寄せください。'
          }
        />
      </Helmet>

      <iframe
        src="https://omnivoc-nu.vercel.app/board/yabai-travel"
        title={isEn ? 'Feedback Board' : '要望・フィードバック'}
        className="w-full h-[calc(100vh-4rem)] border-0"
        allow="clipboard-write"
      />
    </>
  )
}

export default Feedback
