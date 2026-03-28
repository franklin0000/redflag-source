import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Logo from '../components/Logo';
import WalletSignInButton from '../components/WalletSignInButton';

// Debug step tracker shown during login
function DebugSteps({ steps }) {
    if (!steps.length) return null;
    return (
        <div className="mt-3 bg-black/40 border border-white/10 rounded-lg p-3 text-xs font-mono space-y-1">
            {steps.map((s, i) => (
                <div key={i} className={`flex items-center gap-2 ${
                    s.status === 'ok' ? 'text-green-400' :
                    s.status === 'error' ? 'text-red-400' :
                    s.status === 'running' ? 'text-yellow-400 animate-pulse' :
                    'text-gray-500'
                }`}>
                    <span>{s.status === 'ok' ? '✓' : s.status === 'error' ? '✗' : s.status === 'running' ? '…' : '·'}</span>
                    <span>{s.label}</span>
                    {s.detail && <span className="text-gray-400 truncate max-w-[200px]">— {s.detail}</span>}
                </div>
            ))}
        </div>
    );
}

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [debugSteps, setDebugSteps] = useState([]);
    const { signIn: login, user } = useAuth();
    const navigate = useNavigate();
    const toast = useToast();

    useEffect(() => {
        if (user) navigate('/', { replace: true });
    }, [user, navigate]);

    const addStep = (label, status = 'running', detail = '') => {
        setDebugSteps(prev => {
            // Update existing running step if label matches
            const idx = prev.findIndex(s => s.label === label);
            if (idx >= 0) {
                const updated = [...prev];
                updated[idx] = { label, status, detail };
                return updated;
            }
            return [...prev, { label, status, detail }];
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError('');
        setDebugSteps([]);

        try {
            addStep('Conectando al servidor', 'running');
            console.log('[Login] Step 1: connecting to server...');

            const t0 = Date.now();
            await login(email, password);
            const elapsed = Date.now() - t0;

            addStep('Conectando al servidor', 'ok', `${elapsed}ms`);
            addStep('Autenticado', 'ok');
            console.log(`[Login] Success in ${elapsed}ms`);

            toast.success('Welcome back!');
            navigate('/');
        } catch (err) {
            console.error('[Login] Error:', {
                message: err?.message,
                name: err?.name,
                code: err?.code,
                status: err?.status,
                stack: err?.stack?.split('\n')[0],
            });

            const stackLine = err?.stack?.split('\n').slice(1, 3).join(' ').trim() || '';
            addStep('Conectando al servidor', 'error', err?.message || 'unknown');
            addStep('Fallo', 'error', `${err?.name}: ${err?.message}`);
            if (stackLine) addStep('Stack', 'error', stackLine);

            let msg = err.message || 'Error al iniciar sesión.';
            const code = err.code || '';
            if (code === 'invalid_credentials' || msg.includes('Invalid login credentials') || msg.includes('Invalid credentials')) {
                msg = 'Correo o contraseña incorrectos. ¿Eres nuevo? Crea una cuenta con "create a new account".';
            } else if (code === 'email_not_confirmed' || msg.includes('Email not confirmed')) {
                msg = 'Tu correo no ha sido confirmado. Revisa tu inbox.';
            } else if (msg.toLowerCase().includes('rate limit') || code === 'over_request_rate_limit') {
                msg = 'Demasiados intentos. Espera unos minutos.';
            } else if (msg.includes('starting up') || msg.includes('timed out') || msg.includes('TimeoutError') || err?.name === 'TimeoutError') {
                msg = 'El servidor tardó demasiado. Por favor intenta de nuevo en unos segundos.';
            } else if (msg.includes('fetch') || msg.includes('network') || msg.includes('Network')) {
                msg = 'Error de red. Verifica tu conexión a internet.';
            }
            setError(msg);
        } finally {
            setIsSubmitting(false);
        }
    };

    const clearCacheAndReload = () => {
        sessionStorage.clear();
        localStorage.removeItem('rf_token');
        localStorage.removeItem('rf_refresh');
        localStorage.removeItem('splash_shown');
        if ('caches' in window) {
            caches.keys().then(names => Promise.all(names.map(n => caches.delete(n))))
                .finally(() => window.location.reload());
        } else {
            window.location.reload();
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark px-4 py-12 sm:px-6 lg:px-8 font-display">
            <div className="max-w-md w-full space-y-8">
                <div className="text-center">
                    <Logo size="large" className="mb-6 mx-auto" />
                    <h2 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
                        Sign in to your account
                    </h2>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                        Or{' '}
                        <Link to="/signup" className="font-medium text-primary hover:text-primary/80 transition-colors">
                            create a new account
                        </Link>
                    </p>
                </div>

                <div className="mt-8">
                    <WalletSignInButton
                        label="Sign in with Wallet"
                        onSuccess={() => {
                            toast.success('Welcome back!');
                            navigate('/');
                        }}
                        onError={(msg) => setError(msg)}
                    />
                </div>

                <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-300 dark:border-gray-700"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-background-light dark:bg-background-dark text-gray-500">Or continue with email</span>
                    </div>
                </div>

                <form className="mt-4 space-y-6" onSubmit={handleSubmit}>
                    <input type="hidden" name="remember" value="true" />
                    <div className="rounded-md shadow-sm -space-y-px">
                        <div>
                            <label htmlFor="email-address" className="sr-only">Email address</label>
                            <input
                                id="email-address"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="appearance-none rounded-none relative block w-full px-3 py-3 border border-gray-300 dark:border-gray-700 placeholder-gray-500 text-gray-900 dark:text-white dark:bg-gray-800 rounded-t-md focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm"
                                placeholder="Email address"
                            />
                        </div>
                        <div>
                            <label htmlFor="password" className="sr-only">Password</label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                autoComplete="current-password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="appearance-none rounded-none relative block w-full px-3 py-3 border border-gray-300 dark:border-gray-700 placeholder-gray-500 text-gray-900 dark:text-white dark:bg-gray-800 rounded-b-md focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm"
                                placeholder="Password"
                            />
                        </div>
                    </div>

                    <div className="text-right">
                        <Link to="/forgot-password" className="text-xs text-primary hover:text-primary/80 transition-colors">
                            ¿Olvidaste tu contraseña?
                        </Link>
                    </div>

                    {error && (
                        <div className="text-red-500 text-sm text-center bg-red-50 dark:bg-red-900/20 p-2 rounded">
                            {error}
                        </div>
                    )}

                    {/* Debug steps panel */}
                    <DebugSteps steps={debugSteps} />

                    <div>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className={`group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
                        >
                            {isSubmitting ? (
                                <span className="flex items-center gap-2">
                                    <span className="material-icons animate-spin text-sm">refresh</span>
                                    Signing in...
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <span className="material-icons absolute left-0 inset-y-0 flex items-center pl-3">lock_open</span>
                                    Sign in
                                </span>
                            )}
                        </button>
                    </div>
                </form>

                {/* Cache troubleshooting */}
                <div className="mt-6 text-center">
                    <button
                        onClick={clearCacheAndReload}
                        className="text-xs text-gray-400 hover:text-gray-300 underline underline-offset-2"
                    >
                        ¿La app no carga bien? Limpiar caché
                    </button>
                </div>
            </div>
        </div>
    );
}
