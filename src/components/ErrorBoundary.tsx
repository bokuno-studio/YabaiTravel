import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { hasError: boolean; error: Error | null }

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info)
    import('@sentry/react').then(({ captureException }) => {
      captureException(error, { extra: { componentStack: info.componentStack } })
    }).catch(() => {})
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex min-h-[50vh] items-center justify-center p-8">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">エラーが発生しました</h2>
            <p className="text-muted-foreground mb-4">ページを再読み込みしてください</p>
            <button onClick={() => window.location.reload()} className="px-4 py-2 bg-primary text-primary-foreground rounded-md">
              再読み込み
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
export default ErrorBoundary
