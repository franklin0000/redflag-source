// guardianService.js — Express API + Socket.io (no Supabase)
import { guardianApi } from './api';
import { getSocket, connectSocket } from './socketService';

// ── Risk patterns (local analysis, no network needed) ─────────
const RISK_PATTERNS = {
    financial: [
        /send money/i, /bank account/i, /wire transfer/i, /crypto/i, /invest/i,
        /cash app/i, /venmo/i, /paypal/i, /gift card/i, /western union/i,
        /emergency/i, /hospital/i, /stranded/i, /passport/i,
    ],
    harassment: [
        /send nudes/i, /sexy photo/i, /meet now/i, /trust me/i,
        /you owe me/i, /don't tell/i, /secret/i,
    ],
    scam_tactics: [
        /click this link/i, /whatsapp/i, /telegram/i, /investment opportunity/i,
        /military/i, /peacekeeping/i, /inheritance/i,
    ],
};

export async function analyzeMessageRisk(text) {
    await new Promise(resolve => setTimeout(resolve, 300));
    const lowerText = text.toLowerCase();
    const flags = [];
    let riskScore = 0;
    RISK_PATTERNS.financial.forEach(p => { if (p.test(lowerText)) { flags.push('Financial Request'); riskScore += 3; } });
    RISK_PATTERNS.harassment.forEach(p => { if (p.test(lowerText)) { flags.push('High Pressure / Inappropriate'); riskScore += 2; } });
    RISK_PATTERNS.scam_tactics.forEach(p => { if (p.test(lowerText)) { flags.push('Suspicious Pattern'); riskScore += 2; } });
    let riskLevel = 'safe';
    let advice = null;
    if (riskScore >= 3) { riskLevel = 'high'; advice = 'Guardian Alert: High-risk patterns detected. Do not send money or share financial info.'; }
    else if (riskScore > 0) { riskLevel = 'medium'; advice = 'Guardian Tip: Be cautious with requests to move off-platform or share personal details.'; }
    return { riskLevel, flags: [...new Set(flags)], advice };
}

export async function logRiskAnalysis(userId, matchId, analysis) {
    if (analysis.riskLevel !== 'safe') {
        console.warn(`[Guardian] Risk detected for ${userId} in match ${matchId}:`, analysis);
    }
}

// ── Session management (Express API) ─────────────────────────

export async function createGuardianSession(userId, daterName, checkInMinutes = 30, dateLocation = '') {
    const data = await guardianApi.create({
        dater_name: daterName,
        check_in_minutes: checkInMinutes,
        date_location: dateLocation,
    });
    return { session: data };
}

export async function updateGuardianLocation(sessionId, lat, lng) {
    try {
        await guardianApi.updateLocation(sessionId, lat, lng);
        // Also emit via socket for real-time watchers
        const s = getSocket() || connectSocket();
        s?.emit('location:update', { sessionId, lat, lng });
    } catch (err) {
        console.warn('[Guardian] Failed to update location:', err.message);
    }
}

export async function checkInSafe(sessionId) {
    const data = await guardianApi.checkIn(sessionId);
    return { session: data };
}

export async function markTense(sessionId) {
    // Mark via check-in (no dedicated tense endpoint; guardian can see last_checkin)
    console.info('[Guardian] markTense', sessionId);
    return guardianApi.checkIn(sessionId);
}

export async function triggerSOS(sessionId, location = null) {
    const data = await guardianApi.triggerSOS(sessionId, location);
    return { session: data };
}

export async function cancelSOS(sessionId) {
    const data = await guardianApi.cancelSOS(sessionId);
    return { session: data };
}

export async function endGuardianSession(sessionId) {
    const data = await guardianApi.end(sessionId);
    return { session: data };
}

export async function getSessionByToken(token) {
    const data = await guardianApi.viewByToken(token);
    if (!data) throw new Error('Session not found');
    return { session: data };
}

export async function getMyActiveSession() {
    try {
        const data = await guardianApi.getMine();
        // Find the first active session
        const active = Array.isArray(data)
            ? data.find(s => s.is_active)
            : (data?.is_active ? data : null);
        return { session: active || null };
    } catch {
        return { session: null };
    }
}

export function subscribeToSession(sessionToken, onUpdate) {
    const s = getSocket() || connectSocket();
    s?.emit('join_guardian', sessionToken);

    const handler = (payload) => {
        if (payload.session_token === sessionToken || payload.id === sessionToken) {
            onUpdate({ session: payload });
        }
    };

    s?.on('guardian:update', handler);

    return {
        unsubscribe: () => {
            s?.off('guardian:update', handler);
        },
    };
}

export default { analyzeMessageRisk, logRiskAnalysis };
