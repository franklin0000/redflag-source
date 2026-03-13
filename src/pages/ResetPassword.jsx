import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useToast } from '../context/ToastContext';

export default function ResetPassword() {
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const toast = useToast();
    const navigate = useNavigate();
    // Supabase sends the token in the URL hash, auth listener handles the session
    // We just need to call updateUser

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (password.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }
        if (password !== confirm) {
            setError('Passwords do not match.');
            return;
        }
        setLoading(true);
        try {
            const { error: err } = await supabase.auth.updateUser({ password });
            if (err) throw err;
            toast.success('Password updated! Please log in.');
            navigate('/login', { replace: true });
        } catch (err) {
            setError(err.message || 'Failed to update password.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#1a0a18] flex flex-col items-center justify-center px-6 py-12">
            <div className="w-full max-w-sm">
                <div className="flex flex-col items-center mb-8">
                    <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(212,17,180,0.5)] mb-4">
                        <span className="material-icons text-white text-3xl">lock</span>
                    </div>
                    <h1 className="text-2xl font-black text-white tracking-tight">New Password</h1>
                    <p className="text-sm text-gray-400 mt-1 text-center">
                        Choose a strong password for your account
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">
                            {error}
                        </div>
                    )}
                    <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                            New Password
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={8}
                            placeholder="Minimum 8 characters"
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-primary/60 transition-colors"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                            Confirm Password
                        </label>
                        <input
                            type="password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            required
                            placeholder="Repeat password"
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
                            'Update Password'
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
