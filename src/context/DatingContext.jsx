/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../services/supabase';

const DatingContext = createContext(null);

const UNREAD_KEY = 'rf_match_read';

function getReadTimestamps() {
    try { return JSON.parse(localStorage.getItem(UNREAD_KEY) || '{}'); } catch { return {}; }
}

export const DatingProvider = ({ children }) => {
    const { user } = useAuth();
    const [datingProfile, setDatingProfile] = useState(null);
    const [potentialMatches, setPotentialMatches] = useState([]);
    const [matches, setMatches] = useState([]);
    const [loading, setLoading] = useState(true);
    const fetchedOnce = useRef(false);

    // ── Dating Mode JS Toggle / Persist ──────────────────────────
    const [isDatingMode, setIsDatingMode] = useState(() => {
        return localStorage.getItem('rf_dating_mode') === 'true';
    });

    useEffect(() => {
        if (isDatingMode) {
            document.documentElement.setAttribute('data-theme', 'dating');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        localStorage.setItem('rf_dating_mode', isDatingMode);
    }, [isDatingMode]);

    const toggleMode = useCallback(() => {
        setIsDatingMode(prev => !prev);
    }, []);

    // ── Load dating profile on login ──────────────────────────────
    useEffect(() => {
        if (!user) {
            setDatingProfile(null);
            setLoading(false);
            fetchedOnce.current = false;
            return;
        }
        const load = async () => {
            try {
                const { data } = await supabase
                    .from('dating_profiles')
                    .select('*')
                    .eq('user_id', user.id)
                    .single();
                setDatingProfile(data || null);
            } catch (err) {
                console.warn('Dating profile fetch:', err.message);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [user]);

    // ── Fetch potential matches ────────────────────────────────────
    const fetchMatches = useCallback(async (mode = 'local', lat = null, lng = null) => {
        if (!user) return;
        setLoading(true);
        try {
            const userLat = lat ?? 0;
            const userLng = lng ?? 0;
            // Fetch all dating profiles except own, ordered by distance (approx)
            let query = supabase
                .from('dating_profiles')
                .select(`*, users!user_id(id, name, photo_url, gender, is_verified, is_verified_web3)`)
                .neq('user_id', user.id)
                .not('user_id', 'in',
                    `(${(await supabase.from('swipes').select('target_id').eq('swiper_id', user.id)).data?.map(s => s.target_id).join(',') || 'null'})`
                );

            // Filter by gender preference if in women/men room
            if (mode === 'women') query = query.eq('users.gender', 'female');
            else if (mode === 'men') query = query.eq('users.gender', 'male');

            const { data, error } = await query.limit(50);
            if (error) throw error;

            // Sort by distance if location provided
            let profiles = (data || []).map(p => ({
                ...p,
                ...p.users,
                photo: p.photos?.[0] || p.users?.photo_url,
                distance: userLat && userLng && p.lat && p.lng
                    ? Math.round(Math.sqrt(Math.pow((p.lat - userLat) * 111, 2) + Math.pow((p.lng - userLng) * 111, 2)))
                    : null,
            }));
            if (userLat && userLng) profiles.sort((a, b) => (a.distance ?? 999) - (b.distance ?? 999));

            setPotentialMatches(profiles);
        } catch (err) {
            console.error('fetchMatches error:', err.message);
        } finally {
            setLoading(false);
        }
    }, [user]);

    // Auto-fetch on first load
    useEffect(() => {
        if (!user || loading || fetchedOnce.current) return;
        fetchedOnce.current = true;
        fetchMatches();
    }, [user, loading, fetchMatches]);

    // ── Fetch matches list ────────────────────────────────────────
    const fetchMatchesList = useCallback(async () => {
        if (!user) return;
        try {
            const { data, error } = await supabase
                .from('matches')
                .select(`*, user1:users!user1_id(id, name, photo_url, is_verified), user2:users!user2_id(id, name, photo_url, is_verified)`)
                .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
                .neq('status', 'unmatched')
                .order('last_message_time', { ascending: false });
            if (error) throw error;

            // Normalize to always show the OTHER user's info
            const normalized = (data || []).map(m => {
                const other = m.user1_id === user.id ? m.user2 : m.user1;
                return {
                    match_id: m.id,
                    id: other?.id,
                    name: other?.name,
                    photo: other?.photo_url,
                    is_verified: other?.is_verified,
                    last_message: m.last_message,
                    last_message_time: m.last_message_time,
                    unread: 0,
                };
            });
            setMatches(normalized);
        } catch (err) {
            console.error('fetchMatchesList error:', err.message);
        }
    }, [user]);

    useEffect(() => {
        if (!user) return;
        fetchMatchesList();
    }, [user, fetchMatchesList]);

    // ── Swipe ─────────────────────────────────────────────────────
    const swipeProfile = useCallback(async (targetId, direction) => {
        try {
            await supabase.from('swipes').upsert({
                swiper_id: user.id,
                target_id: targetId,
                direction,
            }, { onConflict: 'swiper_id,target_id' });

            // Check for mutual right swipe (match)
            let isMatch = false;
            if (direction === 'right') {
                const { data: theirSwipe } = await supabase
                    .from('swipes')
                    .select('id')
                    .eq('swiper_id', targetId)
                    .eq('target_id', user.id)
                    .eq('direction', 'right')
                    .single();

                if (theirSwipe) {
                    // Create match record
                    const matchId = [user.id, targetId].sort().join('_');
                    await supabase.from('matches').upsert({
                        id: matchId,
                        user1_id: user.id < targetId ? user.id : targetId,
                        user2_id: user.id < targetId ? targetId : user.id,
                        status: 'matched',
                    }, { onConflict: 'id' });
                    isMatch = true;
                    await fetchMatchesList();
                }
            }
            return { isMatch };
        } catch (err) {
            console.error('swipeProfile error:', err.message);
            return { isMatch: false };
        }
    }, [user, fetchMatchesList]);

    // ── Create / update dating profile ────────────────────────────
    const createDatingProfile = useCallback(async (profileData) => {
        const { data, error } = await supabase
            .from('dating_profiles')
            .upsert({ ...profileData, user_id: user?.id }, { onConflict: 'user_id' })
            .select()
            .single();
        if (error) throw error;
        setDatingProfile(data);
        return data;
    }, [user?.id]);

    // ── Mark match as read ────────────────────────────────────────
    function markMatchRead(matchId) {
        const ts = getReadTimestamps();
        ts[matchId] = new Date().toISOString();
        localStorage.setItem(UNREAD_KEY, JSON.stringify(ts));
        // Also mark in DB
        supabase.from('matches').update({ last_message: supabase.raw('last_message') }).eq('id', matchId).catch(() => { });
        // Update local unread count
        setMatches(prev => prev.map(m =>
            m.match_id === matchId ? { ...m, unread: 0 } : m
        ));
    }

    return (
        <DatingContext.Provider value={{
            isDatingMode,
            toggleMode,
            loading,
            datingProfile,
            potentialMatches,
            matches,
            fetchMatches,
            fetchMatchesList,
            swipeProfile,
            createDatingProfile,
            markMatchRead,
        }}>
            {children}
        </DatingContext.Provider>
    );
};

export const useDating = () => {
    const ctx = useContext(DatingContext);
    if (!ctx) throw new Error('useDating must be used inside DatingProvider');
    return ctx;
};
