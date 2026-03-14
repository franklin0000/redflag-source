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

    // ── Dating Mode Toggle ────────────────────────────────────────
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
                const data = await datingApi.getMyProfile();
                setDatingProfile(data || null);
            } catch {
                // no profile yet — that's ok
                setDatingProfile(null);
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
            const data = await datingApi.getPotentialMatches(lat, lng, mode);
            setPotentialMatches(data || []);
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
            const data = await datingApi.getMatches();
            setMatches(data || []);
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
            const isMatch = result?.isMatch || false;
            if (isMatch) await fetchMatchesList();
            return { isMatch };
        } catch (err) {
            console.error('swipeProfile error:', err.message);
            return { isMatch: false };
        }
    }, [fetchMatchesList]);

    // ── Create / update dating profile ────────────────────────────
    const createDatingProfile = useCallback(async (profileData) => {
        const data = await datingApi.saveProfile(profileData);
        setDatingProfile(data);
        return data;
    }, []);

    // ── Mark match as read ────────────────────────────────────────
    const markMatchRead = useCallback((matchId) => {
        const ts = getReadTimestamps();
        ts[matchId] = new Date().toISOString();
        localStorage.setItem(UNREAD_KEY, JSON.stringify(ts));
        setMatches(prev => prev.map(m =>
            m.match_id === matchId ? { ...m, unread: 0 } : m
        ));
    }, []);

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
