import React, { Component, ErrorInfo, ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in React tree:', error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', maxWidth: '800px', margin: '2rem auto', fontFamily: 'sans-serif', backgroundColor: '#1e293b', color: '#f8fafc', borderRadius: '0.75rem', border: '1px solid #ef4444' }}>
          <h2 style={{ color: '#ef4444', fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>
            ⚠️ Đã xảy ra sự cố khi tải giao diện
          </h2>
          <p style={{ fontSize: '0.875rem', marginBottom: '1rem', color: '#cbd5e1' }}>
            {this.state.error?.message || 'Lỗi không xác định'}
          </p>
          <pre style={{ backgroundColor: '#0f172a', padding: '1rem', borderRadius: '0.5rem', overflowX: 'auto', fontSize: '0.75rem', color: '#fca5a5' }}>
            {this.state.error?.stack}
          </pre>
          <button
            onClick={() => {
              // Chỉ xóa phiên dịch lưu tạm; giữ API key và ngân hàng prompt của Thầy.
              Object.keys(localStorage)
                .filter((key) => key.startsWith('firecrawl_batch_cache_'))
                .forEach((key) => localStorage.removeItem(key));
              window.location.reload();
            }}
            style={{ marginTop: '1rem', padding: '0.5rem 1rem', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontWeight: '600' }}
          >
            Xóa phiên dịch lưu tạm và Tải lại trang
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
