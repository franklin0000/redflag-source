/**
 * dashboardService.js — Dashboard stats via Express API
 */
import { statsApi, searchesApi } from './api';

export async function getUserDashboardStats(userId) {
    if (!userId) return getDefaults();
    try {
        return await statsApi.dashboard();
    } catch (err) {
        console.warn('Dashboard stats fetch failed:', err);
        return getDefaults();
    }
}

export async function getCommunityStats() {
    try {
        return await statsApi.community();
    } catch (err) {
        console.warn('Community stats failed:', err);
        return { totalReports: 0, totalUsers: 0 };
    }
}

export async function getUserRecentSearches(userId, max = 5) {
    if (!userId) return [];
    try {
        const data = await searchesApi.getAll(max);
        return (data || []).map(d => ({
            id: d.id,
            ...d,
            timestamp: new Date(d.created_at),
        }));
    } catch (err) {
        console.warn('Recent searches fetch failed:', err);
        return [];
    }
}

export function subscribeToLiveActivity(callback) {
    let cancelled = false;

    const fetchActivity = async () => {
        try {
            const data = await statsApi.activity();
            if (!cancelled) callback(data || []);
        } catch {
            if (!cancelled) callback([]);
        }
    };

    fetchActivity();

    // Poll every 60 seconds for new activity
    const interval = setInterval(fetchActivity, 60000);

    return () => {
        cancelled = true;
        clearInterval(interval);
    };
}

function getDefaults() {
    return { totalScans: 0, reportsCount: 0, daysProtected: 1, safetyScore: 50 };
}
