import React from 'react';

const isChunkError = (error) => {
    const msg = error?.message || '';
    return (
        error?.name === 'ChunkLoadError' ||
        msg.includes('Failed to fetch dynamically imported module') ||
        msg.includes('Loading chunk') ||
        msg.includes('Importing a module script failed') ||
        msg.includes('error loading dynamically imported module')
    );
};

export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, reloading: false, componentStack: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary caught:', error, errorInfo);
        this.setState({ componentStack: errorInfo?.componentStack || null });
        // Auto-reload once for chunk load errors (stale service worker cache after deploy)
        if (isChunkError(error) && !sessionStorage.getItem('rf_eb_reloaded')) {
            sessionStorage.setItem('rf_eb_reloaded', '1');
            window.location.reload();
        }
    }

    render() {
        if (this.state.hasError) {
            const errMsg = this.state.error?.message || '';
            const isChunk = isChunkError(this.state.error);

            return (
                <div className="min-h-screen flex items-center justify-center bg-background-dark p-6">
                    <div className="text-center max-w-sm">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
                            <span className="material-icons text-red-500 text-3xl">error_outline</span>
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">Something went wrong</h2>
                        <p className="text-sm text-gray-400 mb-2">
                            {isChunk
                                ? 'App update detected. Reloading...'
                                : 'An unexpected error occurred.'}
                        </p>
                        {errMsg && (
                            <p className="text-xs text-red-400 mb-2 font-mono bg-black/30 rounded p-2 text-left break-all">
                                {errMsg}
                            </p>
                        )}
                        {this.state.componentStack && (
                            <p className="text-xs text-gray-500 mb-4 font-mono bg-black/20 rounded p-2 text-left break-all whitespace-pre-wrap" style={{maxHeight:'120px',overflow:'auto'}}>
                                {this.state.componentStack.trim().split('\n').slice(0,6).join('\n')}
                            </p>
                        )}
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <button
                                onClick={() => {
                                    sessionStorage.removeItem('rf_eb_reloaded');
                                    window.location.href = '/';
                                }}
                                className="px-6 py-3 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors"
                            >
                                Go to Home
                            </button>
                            <button
                                onClick={() => {
                                    sessionStorage.clear();
                                    localStorage.removeItem('rf_token');
                                    localStorage.removeItem('rf_refresh');
                                    if ('caches' in window) {
                                        caches.keys().then(names => Promise.all(names.map(n => caches.delete(n))))
                                            .finally(() => window.location.reload());
                                    } else {
                                        window.location.reload();
                                    }
                                }}
                                className="px-6 py-3 bg-gray-700 text-white font-medium rounded-lg hover:bg-gray-600 transition-colors text-sm"
                            >
                                Clear Cache &amp; Reload
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
