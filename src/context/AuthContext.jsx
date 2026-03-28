/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useContext, useEffect, useRef } from 'react';
import { authApi, usersApi, setToken, getToken } from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socketService';

const setRefreshToken = (t) => t
    ? localStorage.setItem('rf_refresh', t)
    : localStorage.removeItem('rf_refresh');

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const mountedRef = useRef(true);

    useEffect(() => {
        return () => { mountedRef.current = false; };
    }, []);

    // Restore session from stored token on mount
    useEffect(() => {
        const initializeAuth = async () => {
            if (!getToken()) {
                if (mountedRef.current) setLoading(false);
                return;
            }
            try {
                const data = await authApi.me();
                if (mountedRef.current && data && data.user) {
                    setUser(normalizeUser(data.user));
                    try { connectSocket(); } catch (e) { console.warn('[Auth] socket init failed:', e); }
                }
            } catch (err) {
                console.warn('[Auth] Session restore failed:', err?.message || err);
                setToken(null);
                setRefreshToken(null);
            } finally {
                if (mountedRef.current) setLoading(false);
            }
        };

        initializeAuth();
    }, []);

    const normalizeUser = (data) => ({
        ...data,
        isPaid: data.is_paid || false,
        isVerified: data.is_verified || false,
        isVerifiedWeb3: data.is_verified_web3 || false,
    });

    const signUp = async (email, password, name, gender) => {
        const data = await authApi.register(email, password, name, gender);
        setToken(data.token);
        setRefreshToken(data.refresh_token);
        if (mountedRef.current) setUser(normalizeUser(data.user));
        try { connectSocket(); } catch (e) { console.warn('[Auth] socket init failed:', e); }
        return data;
    };

    const signIn = async (email, password) => {
        const data = await authApi.login(email, password);
        setToken(data.token);
        setRefreshToken(data.refresh_token);
        if (mountedRef.current) setUser(normalizeUser(data.user));
        try { connectSocket(); } catch (e) { console.warn('[Auth] socket init failed:', e); }
        return data;
    };

    const signOut = async () => {
        await authApi.logout();
        setToken(null);
        setRefreshToken(null);
        disconnectSocket();
        if (mountedRef.current) setUser(null);
    };

    const updateProfile = async (updates) => {
        const data = await usersApi.updateMe(updates);
        if (mountedRef.current && data) setUser(prev => ({ ...prev, ...normalizeUser(data) }));
        return data;
    };

    const updateSubscription = async (status) => {
        const isPaid = status === 'paid' || status === true;
        await usersApi.updateSubscription(isPaid);
        if (mountedRef.current) setUser(prev => ({ ...prev, isPaid, is_paid: isPaid }));
    };

    const refreshUser = async () => {
        try {
            const data = await authApi.me();
            if (mountedRef.current && data && data.user) setUser(normalizeUser(data.user));
        } catch {
            // silently fail
        }
    };

    return (
        <AuthContext.Provider value={{
            user,
            loading,
            signUp,
            signup: signUp,
            signIn,
            login: signIn,
            signOut,
            logout: signOut,
            updateProfile,
            updateSubscription,
            refreshUser,
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
    return ctx;
};
