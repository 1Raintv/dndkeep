import { Component, type ReactNode, type ErrorInfo } from 'react';
import { log } from '../lib/log';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  section?: string;
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
    const section = this.props.section ?? '';
    // v2.640 audit 2.8 — route through the log facade: the console sink
    // preserves the old DevTools output, the telemetry sink ships it.
    log.error(`ErrorBoundary${section ? ':' + section : ''} caught render crash`, error, {
      section, componentStack: info.componentStack?.slice(0, 1000),
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div style={{
        padding: '24px', margin: '8px 0', borderRadius: 10,
        background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <div style={{ fontWeight: 700, color: '#f87171', fontSize: 14 }}>
          ⚠ {this.props.section ? `${this.props.section} failed to load` : 'Something went wrong'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--t-3)', fontFamily: 'monospace' }}>
          {this.state.error?.message}
        </div>
        <button
          onClick={() => this.setState({ hasError: false, error: null })}
          style={{ alignSelf: 'flex-start', fontSize: 12, fontWeight: 700, padding: '4px 12px',
            borderRadius: 6, cursor: 'pointer', border: '1px solid rgba(239,68,68,0.4)',
            background: 'rgba(239,68,68,0.1)', color: '#f87171' }}
        >
          Try again
        </button>
      </div>
    );
  }
}
