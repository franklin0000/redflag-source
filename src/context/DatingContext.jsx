/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { datingApi } from '../services/api';

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
                const profile = await datingApi.getMyProfile();
                setDatingProfile(profile);
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
            const userLat = lat ?? user.lat ?? 0;
            const userLng = lng ?? user.lng ?? 0;
            const profiles = await datingApi.getPotentialMatches(userLat, userLng, mode);
            setPotentialMatches(profiles || []);
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
            const list = await datingApi.getMatches();
            setMatches(list || []);
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
            const result = await datingApi.swipe(targetId, direction);
            if (result.isMatch) await fetchMatchesList();
            return result;
        } catch (err) {
            console.error('swipeProfile error:', err.message);
            return { isMatch: false };
        }
    }, [fetchMatchesList]);

    // ── Create / update dating profile ────────────────────────────
    const createDatingProfile = useCallback(async (profileData) => {
        const saved = await datingApi.saveProfile(profileData);
        setDatingProfile(saved);
        return saved;
    }, []);

    // ── Mark match as read ────────────────────────────────────────
    function markMatchRead(matchId) {
        const ts = getReadTimestamps();
        ts[matchId] = new Date().toISOString();
        localStorage.setItem(UNREAD_KEY, JSON.stringify(ts));
        // Also mark in DB
        datingApi.markRead(matchId).catch(() => {});
        // Update local unread count
        setMatches(prev => prev.map(m =>
            m.match_id === matchId ? { ...m, unread: 0 } : m
        ));
    }

    return (
        <DatingContext.Provider value={{
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
