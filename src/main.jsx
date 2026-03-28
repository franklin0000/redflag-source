import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import SplashScreen from './components/SplashScreen.jsx';
import { Web3Provider } from './context/Web3Provider';
import { registerSW } from 'virtual:pwa-register';

// Recover from stale SW cache: if a lazy-loaded JS chunk 404s, reload once
window.addEventListener('unhandledrejection', (event) => {
  const msg = event.reason?.message || '';
  if (
    event.reason?.name === 'ChunkLoadError' ||
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module')
  ) {
    if (!sessionStorage.getItem('chunk_reload')) {
      sessionStorage.setItem('chunk_reload', '1');
      window.location.reload();
    }
  }
});

// Register PWA Service Worker — auto-reload on new version
registerSW({
  onNeedRefresh() {
    // Guard against infinite reload loops (multiple rapid deploys)
    if (!sessionStorage.getItem('sw_refreshed')) {
      sessionStorage.setItem('sw_refreshed', '1');
      window.location.reload();
    }
  },
  onOfflineReady() {},
  onRegistered(r) {
    // Poll for updates every 60 s
    r && setInterval(() => r.update(), 60_000);
  },
});

import './index.css';

// Simple Error Boundary for Startup
class GlobalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Global Startup Error:", error, errorInfo);
    this.setState({ componentStack: errorInfo?.componentStack || null });
  }

  render() {
    if (this.state.hasError) {
      const stack = this.state.componentStack || '';
      const shortStack = stack.split('\n').slice(0, 8).join('\n');
      return (
        <div style={{ padding: 20, color: 'white', background: '#333', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <h1 style={{ color: '#ff4d4f' }}>Startup Error</h1>
          <pre style={{ background: '#000', padding: 20, borderRadius: 8, maxWidth: '90%', overflow: 'auto', fontSize: 11, textAlign: 'left' }}>
            {this.state.error?.toString()}{shortStack ? '\n\nIn:' + shortStack : ''}
          </pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: 20, padding: '10px 20px', cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// eslint-disable-next-line react-refresh/only-export-components
function Root() {
  const [showSplash, setShowSplash] = useState(() => !localStorage.getItem('splash_shown'));

  const handleSplashComplete = () => {
    localStorage.setItem('splash_shown', 'true');
    setShowSplash(false);
  };

  return (
    <GlobalErrorBoundary>
      <React.StrictMode>
        <HashRouter>
          {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
          <Web3Provider>
            <App />
          </Web3Provider>
        </HashRouter>
      </React.StrictMode>
    </GlobalErrorBoundary>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
