import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Logo from '../components/Logo';
import WalletSignInButton from '../components/WalletSignInButton';

export default function Signup() {
    // ... state ...
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [gender, setGender] = useState(''); // 'female' or 'male'
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { signup } = useAuth();
    const navigate = useNavigate();
    const toast = useToast();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!gender) {
            setError('Please select your gender.');
            return;
        }
        setIsSubmitting(true);
        setError('');
        try {
            await signup(email, password, name);
            toast.success('Account created!');
            navigate('/');
        } catch (err) {
            let msg = err.message || 'No se pudo crear la cuenta.';
            if (msg.includes('User already registered') || msg.includes('assigned to another user')) msg = 'Este correo ya está registrado.';
            if (msg.includes('rate limit') || msg.includes('too many')) msg = 'Too many attempts. Wait a few minutes, or use the wallet button above instead.';
            if (msg.includes('Password should be at least')) msg = 'La contraseña debe tener al menos 6 caracteres.';
            if (msg.includes('invalid') && msg.includes('email')) msg = 'El formato del correo es inválido.';
            setError(msg);
            console.error(err);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark px-4 py-12 sm:px-6 lg:px-8 font-display">
            <div className="max-w-md w-full space-y-8">
                <div className="text-center">
                    <Logo size="large" className="mb-6 mx-auto" />
                    <h2 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
                        Create your account
                    </h2>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Join the RedFlag community</p>
                </div>

                <div className="mt-8">
                    <WalletSignInButton
                        label="Sign up with Wallet"
                        onSuccess={() => {
                            toast.success('Account created!');
                            navigate('/');
                        }}
                        onError={(msg) => setError(msg)}
                    />

                    <div className="relative my-6">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-300 dark:border-gray-700"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-2 bg-background-light dark:bg-background-dark text-gray-500">Or continue with email</span>
                        </div>
                    </div>
                </div>

                <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="name" className="sr-only">Full Name</label>
                            <input
                                id="name"
                                name="name"
                                type="text"
                                autoComplete="name"
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="appearance-none rounded-none relative block w-full px-4 py-3 border border-gray-300 dark:border-gray-700 placeholder-gray-500 text-gray-900 dark:text-white dark:bg-gray-800 rounded-t-xl focus:outline-none focus:ring-primary focus:border-primary focus:z-10 text-sm"
                                placeholder="Full Name"
                            />
                        </div>

                        {/* Gender Selection */}
                        <div className="py-2">
                            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 ml-1">Soy...</label>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setGender('female')}
                                    className={`py-3 rounded-xl border font-medium transition-all flex items-center justify-center gap-2 ${gender === 'female' ? 'bg-primary/20 border-primary text-primary shadow-glow-sm' : 'bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10'}`}
                                >
                                    <span className="material-icons text-lg">female</span>
                                    Mujer
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setGender('male')}
                                    className={`py-3 rounded-xl border font-medium transition-all flex items-center justify-center gap-2 ${gender === 'male' ? 'bg-blue-500/20 border-blue-500 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.2)]' : 'bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10'}`}
                                >
                                    <span className="material-icons text-lg">male</span>
                                    Hombre
                                </button>
                            </div>
                        </div>

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
                                className="appearance-none rounded-none relative block w-full px-4 py-3 border border-gray-300 dark:border-gray-700 placeholder-gray-500 text-gray-900 dark:text-white dark:bg-gray-800 focus:outline-none focus:ring-primary focus:border-primary focus:z-10 text-sm"
                                placeholder="Email address"
                            />
                        </div>
                        <div>
                            <label htmlFor="password" className="sr-only">Password</label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                autoComplete="new-password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="appearance-none rounded-none relative block w-full px-4 py-3 border border-gray-300 dark:border-gray-700 placeholder-gray-500 text-gray-900 dark:text-white dark:bg-gray-800 rounded-b-xl focus:outline-none focus:ring-primary focus:border-primary focus:z-10 text-sm"
                                placeholder="Password"
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="text-red-500 text-sm text-center bg-red-50 dark:bg-red-900/20 p-2 rounded">
                            {error}
                        </div>
                    )}

                    <div>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className={`group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
                        >
                            {isSubmitting ? (
                                <span className="flex items-center gap-2">
                                    <span className="material-icons animate-spin text-sm">refresh</span>
                                    Creating Account...
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <span className="material-icons absolute left-0 inset-y-0 flex items-center pl-3">check_circle</span>
                                    Sign Up
                                </span>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
