/**
 * reportsService.js — Reports CRUD via Express API
 */
import { reportsApi } from './api';
import { uploadEvidence as uploadEvidenceStorage } from './storageService';
import { secureGet, secureSet } from './secureStorage';

export const reportsService = {
    /**
     * Upload evidence file and return the URL
     */
    uploadEvidence: async (file) => {
        const userId = (() => {
            try {
                return JSON.parse(atob(localStorage.getItem('rf_token')?.split('.')[1] || 'e30=')).sub;
            } catch { return 'unknown'; }
        })();
        return uploadEvidenceStorage(file, userId);
    },

    /**
     * Create a new report. Falls back to offline storage on failure.
     */
    createReport: async (reportData) => {
        const reportPayload = {
            reported_name: reportData.name || reportData.reported_name || 'Unknown',
            platform: reportData.handle || reportData.platform,
            description: reportData.details || reportData.description,
            category: reportData.selectedFlags?.[0] || reportData.type || 'Other',
            evidence_urls: reportData.photos || [],
        };

        try {
            const data = await reportsApi.createReport(reportPayload);
            return data.id;
        } catch (error) {
            console.warn('Report submission failed, saving offline:', error);
            const offlineReport = {
                id: `local_${Date.now()}`,
                ...reportPayload,
                created_at: new Date().toISOString(),
                offline: true,
                syncStatus: 'pending',
            };
            const currentOffline = await secureGet('offline_reports') || [];
            await secureSet('offline_reports', [offlineReport, ...currentOffline]);
            return offlineReport.id;
        }
    },

    /**
     * Fetch recent reports (online + offline)
     */
    getRecentReports: async (limitCount = 10) => {
        let onlineReports = [];
        try {
            onlineReports = await reportsApi.getReports(limitCount);
        } catch (e) {
            console.warn('Failed to fetch online reports:', e);
        }

        const offlineReports = await secureGet('offline_reports') || [];

        const allReports = [...offlineReports, ...onlineReports].sort(
            (a, b) => new Date(b.created_at) - new Date(a.created_at)
        );

        return allReports.slice(0, limitCount).map(d => ({
            id: d.id,
            ...d,
            createdAt: new Date(d.created_at),
            isOffline: !!d.offline,
        }));
    },
};
