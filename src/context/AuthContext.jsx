/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useContext, useEffect, useRef } from 'react';
import { authApi, usersApi } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const mountedRef = useRef(true);

    useEffect(() => {
        return () => { mountedRef.current = false; };
    }, []);

    // On mount: restore session from localStorage token
    useEffect(() => {
        const restore = async () => {
            if (!authApi.isLoggedIn()) {
                setLoading(false);
                return;
            }
            try {
                const { user: me } = await authApi.me();
                if (mountedRef.current) {
                    setUser(normalizeUser(me));
                }
            } catch {
                // Token invalid — clear it
                authApi.setToken(null);
                authApi.setRefreshToken(null);
            } finally {
                if (mountedRef.current) setLoading(false);
            }
        };
        restore();
    }, []);

    function normalizeUser(raw) {
        return {
            ...raw,
            isPaid: raw.is_paid || false,
            isVerified: raw.is_verified || false,
            isVerifiedWeb3: raw.is_verified_web3 || false,
        };
    }

    const signUp = async (email, password, name) => {
        const data = await authApi.register(email, password, name);
        authApi.setToken(data.token);
        authApi.setRefreshToken(data.refresh_token);
        if (mountedRef.current) setUser(normalizeUser(data.user));
        return data;
    };

    const signIn = async (email, password) => {
        const data = await authApi.login(email, password);
        if (mountedRef.current) setUser(normalizeUser(data.user));
        return data;
    };

    const signOut = async () => {
        await authApi.logout();
        if (mountedRef.current) setUser(null);
    };

    const updateProfile = async (updates) => {
        const updated = await usersApi.updateMe(updates);
        if (mountedRef.current) setUser(prev => ({ ...prev, ...normalizeUser(updated) }));
        return updated;
    };

    const updateSubscription = async (status) => {
        const isPaid = status === 'paid' || status === true;
        await usersApi.updateSubscription(isPaid);
        if (mountedRef.current) setUser(prev => ({ ...prev, isPaid, is_paid: isPaid }));
    };

    const refreshUser = async () => {
        try {
            const { user: me } = await authApi.me();
            if (mountedRef.current) setUser(normalizeUser(me));
        } catch (err) {
            console.error('refreshUser error:', err);
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
