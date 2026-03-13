/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useContext, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const mountedRef = useRef(true);

    useEffect(() => {
        return () => { mountedRef.current = false; };
    }, []);

    const fetchPublicUser = async (uid, authSource) => {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', uid)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Error fetching public user:', error);
        }

        let pUser = data || {};

        return {
            ...pUser,
            ...authSource,
            id: uid,
            isPaid: pUser.is_paid || false,
            isVerified: pUser.is_verified || false,
            isVerifiedWeb3: pUser.is_verified_web3 || false,
        };
    };

    useEffect(() => {
        const initializeAuth = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                const fullUser = await fetchPublicUser(session.user.id, session.user);
                if (mountedRef.current) setUser(fullUser);
            }
            if (mountedRef.current) setLoading(false);
        };

        initializeAuth();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
                if (session?.user) {
                    const fullUser = await fetchPublicUser(session.user.id, session.user);
                    if (mountedRef.current) setUser(fullUser);
                }
            } else if (event === 'SIGNED_OUT') {
                if (mountedRef.current) setUser(null);
            }
        });

        return () => {
            subscription?.unsubscribe();
        };
    }, []);

    const signUp = async (email, password, name, gender) => {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
        });

        if (error) throw error;

        if (data?.user) {
            // Upsert into public.users
            const { error: upsertError } = await supabase
                .from('users')
                .upsert({
                    id: data.user.id,
                    email,
                    name,
                    gender,
                });
            if (upsertError) console.error('Error creating public user:', upsertError);

            const fullUser = await fetchPublicUser(data.user.id, data.user);
            if (mountedRef.current) setUser(fullUser);
        }

        return data;
    };

    const signIn = async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        if (error) throw error;

        const fullUser = await fetchPublicUser(data.user.id, data.user);
        if (mountedRef.current) setUser(fullUser);
        return data;
    };

    const signOut = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) console.error('Signout error:', error);
        if (mountedRef.current) setUser(null);
    };

    const updateProfile = async (updates) => {
        if (!user?.id) return;
        const { data, error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', user.id)
            .select()
            .single();

        if (error) throw error;
        const updated = fetchPublicUser(user.id, user);
        if (mountedRef.current) setUser(prev => ({ ...prev, ...updated }));
        return updated;
    };

    const updateSubscription = async (status) => {
        if (!user?.id) return;
        const isPaid = status === 'paid' || status === true;
        const { error } = await supabase
            .from('users')
            .update({ is_paid: isPaid })
            .eq('id', user.id);

        if (error) throw error;
        if (mountedRef.current) setUser(prev => ({ ...prev, isPaid, is_paid: isPaid }));
    };

    const refreshUser = async () => {
        if (!user?.id) return;
        const fullUser = await fetchPublicUser(user.id, user);
        if (mountedRef.current) setUser(fullUser);
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
