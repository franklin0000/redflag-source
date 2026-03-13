import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabase';

export default function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [sent, setSent] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/#/reset-password',
            });
            if (err) throw err;
            setSent(true);
        } catch (err) {
            setError(err.message || 'Failed to send reset email.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#1a0a18] flex flex-col items-center justify-center px-6 py-12">
            <div className="w-full max-w-sm">
                <div className="flex flex-col items-center mb-8">
                    <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(212,17,180,0.5)] mb-4">
                        <span className="material-icons text-white text-3xl">lock_reset</span>
                    </div>
                    <h1 className="text-2xl font-black text-white tracking-tight">Forgot Password</h1>
                    <p className="text-sm text-gray-400 mt-1 text-center">
                        We'll send you a link to reset your password
                    </p>
                </div>

                {sent ? (
                    <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-6 text-center">
                        <span className="material-icons text-green-400 text-4xl mb-3 block">mark_email_read</span>
                        <h2 className="text-lg font-bold text-white mb-1">Check your inbox</h2>
                        <p className="text-sm text-gray-400 mb-4">
                            We sent a password reset link to <span className="text-white font-medium">{email}</span>
                        </p>
                        <Link to="/login" className="text-primary text-sm font-medium hover:underline">
                            Back to Login
                        </Link>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">
                                {error}
                            </div>
                        )}
                        <div>
                            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                                Email address
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                placeholder="you@example.com"
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-primary/60 transition-colors"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3.5 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/30 hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                'Send Reset Link'
                            )}
                        </button>
                        <p className="text-center text-sm text-gray-500">
                            <Link to="/login" className="text-primary hover:underline">Back to Login</Link>
                        </p>
                    </form>
                )}
            </div>
        </div>
    );
}
