/**
 * 🛡️ Guardian Service
 *
 * Two responsibilities:
 *  1. Risk analysis — heuristic scan of chat messages for red flags
 *  2. Guardian sessions — real-time Supabase-backed safety sessions
 */
// Guardian service — uses localStorage for session data (no Supabase dependency)

// ── Risk patterns ─────────────────────────────────────────────────────────────
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

/**
 * Analyse a chat message for potential risks.
 * @returns {{ riskLevel: 'safe'|'medium'|'high', flags: string[], advice: string|null }}
 */
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
    if (riskScore >= 3) {
        riskLevel = 'high';
        advice = 'Guardian Alert: High-risk patterns detected. Do not send money or share financial info.';
    } else if (riskScore > 0) {
        riskLevel = 'medium';
        advice = 'Guardian Tip: Be cautious with requests to move off-platform or share personal details.';
    }

    return { riskLevel, flags: [...new Set(flags)], advice };
}

export async function logRiskAnalysis(userId, matchId, analysis) {
    if (analysis.riskLevel !== 'safe') {
        console.warn(`[Guardian] Risk detected for ${userId} in match ${matchId}:`, analysis);
    }
}

// ── Token generator ───────────────────────────────────────────────────────────
function generateToken() {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

// ── Session management ────────────────────────────────────────────────────────

/**
 * Create a new guardian session.
 * @param {string} userId
 * @param {string} daterName
 * @param {number} checkInMinutes — how often the dater must check in
 * @param {string} [dateLocation] — optional venue name/address
 * @returns {Promise<object>} session row
 */
const STORAGE_KEY = 'rf_guardian_sessions';

function getSessions() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}
function saveSessions(sessions) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

export async function createGuardianSession(userId, daterName, checkInMinutes = 30, dateLocation = '') {
    const token = generateToken();
    const session = {
        id: token,
        dater_id: userId,
        session_token: token,
        dater_name: daterName || 'Unknown',
        date_location: dateLocation || null,
        check_in_minutes: checkInMinutes,
        expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
        is_active: true,
        is_sos: false,
        sentiment: 'normal',
        last_checkin_at: new Date().toISOString(),
        location: null,
    };
    const sessions = getSessions();
    sessions[token] = session;
    saveSessions(sessions);
    return session;
}

export async function updateGuardianLocation(sessionId, lat, lng) {
    const sessions = getSessions();
    if (sessions[sessionId]) {
        sessions[sessionId].location = { lat, lng, updatedAt: new Date().toISOString() };
        sessions[sessionId].last_checkin_at = new Date().toISOString();
        saveSessions(sessions);
    }
}

export async function checkInSafe(sessionId) {
    const sessions = getSessions();
    if (sessions[sessionId]) {
        sessions[sessionId].last_checkin_at = new Date().toISOString();
        sessions[sessionId].sentiment = 'normal';
        sessions[sessionId].is_sos = false;
        saveSessions(sessions);
    }
}

export async function markTense(sessionId) {
    const sessions = getSessions();
    if (sessions[sessionId]) {
        sessions[sessionId].sentiment = 'tense';
        saveSessions(sessions);
    }
}

export async function triggerSOS(sessionId) {
    const sessions = getSessions();
    if (sessions[sessionId]) {
        sessions[sessionId].is_sos = true;
        sessions[sessionId].sentiment = 'alert';
        saveSessions(sessions);
    }
}

export async function cancelSOS(sessionId) {
    const sessions = getSessions();
    if (sessions[sessionId]) {
        sessions[sessionId].is_sos = false;
        sessions[sessionId].sentiment = 'normal';
        sessions[sessionId].last_checkin_at = new Date().toISOString();
        saveSessions(sessions);
    }
}

export async function endGuardianSession(sessionId) {
    const sessions = getSessions();
    if (sessions[sessionId]) {
        sessions[sessionId].is_active = false;
        saveSessions(sessions);
    }
}

export async function getSessionByToken(token) {
    const sessions = getSessions();
    const session = sessions[token];
    if (!session || !session.is_active) throw new Error('Session not found');
    return session;
}

export function subscribeToSession(sessionId, onUpdate) {
    // Poll localStorage every 5 seconds for updates
    const interval = setInterval(() => {
        const sessions = getSessions();
        if (sessions[sessionId]) onUpdate(sessions[sessionId]);
    }, 5000);
    return { unsubscribe: () => clearInterval(interval) };
}

export default { analyzeMessageRisk, logRiskAnalysis };
