import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode; label?: string }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[300px] p-6 gap-4">
          <div className="text-4xl">⚠️</div>
          <h2 className="font-bold text-red-600 text-lg">Lỗi trong {this.props.label ?? 'component'}</h2>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 max-w-2xl w-full overflow-auto">
            <p className="text-red-700 font-mono text-sm font-bold">{this.state.error.message}</p>
            <pre className="text-red-500 text-xs mt-2 whitespace-pre-wrap">
              {this.state.error.stack?.slice(0, 800)}
            </pre>
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-400"
          >
            Thử lại
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
