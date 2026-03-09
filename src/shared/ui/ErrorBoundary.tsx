import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{
          padding: 40,
          textAlign: 'center',
          color: 'var(--text-secondary)',
          fontFamily: "'Source Sans 3', sans-serif",
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
            页面加载出错
          </p>
          <p style={{ fontSize: '0.875rem', marginBottom: 20 }}>
            {this.state.error?.message ?? '未知错误'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-panel)',
              color: 'var(--accent)',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
