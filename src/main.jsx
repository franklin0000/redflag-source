import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import SplashScreen from './components/SplashScreen.jsx';
import { Web3Provider } from './context/Web3Provider';
import { registerSW } from 'virtual:pwa-register';

// Helper: was the current page load triggered by a reload (vs. fresh navigation)?
// Used to break update/chunk-error reload loops — we only reload on fresh navigations.
function wasPageReloaded() {
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    return nav?.type === 'reload' || nav?.type === 'back_forward';
  } catch { return false; }
}

// Server warmup ping — fires immediately on page load (fire & forget).
// Wakes Render free-tier cold starts before the user even touches the form.
{
  const BASE = import.meta.env.VITE_API_URL || '';
  fetch(`${BASE}/health`, { method: 'GET', cache: 'no-store' }).catch(() => {});
}

// Recover from stale SW cache: if a lazy-loaded JS chunk 404s, reload once
window.addEventListener('unhandledrejection', (event) => {
  const msg = event.reason?.message || '';
  if (
    event.reason?.name === 'ChunkLoadError' ||
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module')
  ) {
    if (!wasPageReloaded()) window.location.reload();
  }
});

// Register PWA Service Worker — clear cache and reload on new version
registerSW({
  onNeedRefresh() {
    // Clear all SW caches then reload — prevents stale JS chunks after deploys.
    // Anti-loop: track the reload in sessionStorage so we only do it once per session.
    const key = 'sw_cache_cleared';
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    if ('caches' in window) {
      caches.keys().then(names => Promise.all(names.map(n => caches.delete(n))))
        .finally(() => window.location.reload());
    } else {
      window.location.reload();
    }
  },
  onOfflineReady() {},
  onRegistered(r) {
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
