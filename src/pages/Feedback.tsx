import { useParams } from 'react-router-dom'
import { useRef, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'

function Feedback() {
  const { lang } = useParams<{ lang: string }>()
  const isEn = lang === 'en'
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const script = document.createElement('script')
    script.src = 'https://omnivoc-nu.vercel.app/board.js'
    script.setAttribute('data-project-key', 'yabai-travel')
    script.setAttribute('data-lang', lang || 'ja')
    container.appendChild(script)

    return () => {
      script.remove()
    }
  }, [lang])

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

      <div className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="text-2xl font-bold mb-4">
          {isEn ? 'Feedback' : '要望・フィードバック'}
        </h1>
        <div ref={containerRef} id="board-container" />
      </div>
    </>
  )
}

export default Feedback
