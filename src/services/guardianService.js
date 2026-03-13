

import { supabase } from '../lib/supabase';

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

// ── Session management (Supabase PostgreSQL + Realtime) ─────────────────────

export async function createGuardianSession(userId, daterName, checkInMinutes = 30, dateLocation = '') {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 12); // Hard 12-hour limit on sessions

    // Generate a unique token for the share link
    const sessionToken = crypto.randomUUID();

    // Find and end existing active session for this user
    await supabase.from('guardian_sessions').update({ is_active: false }).eq('dater_id', userId).eq('is_active', true);

    const { data, error } = await supabase.from('guardian_sessions').insert({
        dater_id: userId,
        session_token: sessionToken,
        dater_name: daterName,
        check_in_minutes: checkInMinutes,
        date_location: dateLocation,
        is_active: true,
        is_sos: false,
        sentiment: 'normal',
        expires_at: expiresAt.toISOString(),
    }).select().single();

    if (error) throw error;
    // Map db data to what the frontend expects
    return { session: data };
}

export async function updateGuardianLocation(sessionId, lat, lng) {
    try {
        await supabase.from('guardian_sessions').update({
            location: { lat, lng, updatedAt: new Date().toISOString() }
        }).eq('id', sessionId);
    } catch (err) {
        console.warn('[Guardian] Failed to update location:', err.message);
    }
}

export async function checkInSafe(sessionId) {
    const { data, error } = await supabase.from('guardian_sessions').update({
        last_checkin_at: new Date().toISOString()
    }).eq('id', sessionId).select().single();

    if (error) throw error;
    return { session: data };
}

export async function markTense(sessionId) {
    await supabase.from('guardian_sessions').update({
        sentiment: 'tense'
    }).eq('id', sessionId);
    console.info('[Guardian] markTense', sessionId);
}

export async function triggerSOS(sessionId, location = null) {
    const updates = { is_sos: true, sentiment: 'panic' };
    if (location) {
        updates.location = { ...location, updatedAt: new Date().toISOString() };
    }
    const { data, error } = await supabase.from('guardian_sessions').update(updates).eq('id', sessionId).select().single();
    if (error) throw error;
    return { session: data };
}

export async function cancelSOS(sessionId) {
    const { data, error } = await supabase.from('guardian_sessions').update({
        is_sos: false,
        sentiment: 'normal',
        last_checkin_at: new Date().toISOString()
    }).eq('id', sessionId).select().single();
    if (error) throw error;
    return { session: data };
}

export async function endGuardianSession(sessionId) {
    const { data, error } = await supabase.from('guardian_sessions').update({
        is_active: false,
        expires_at: new Date().toISOString()
    }).eq('id', sessionId).select().single();
    if (error) throw error;
    return { session: data };
}

export async function getSessionByToken(token) {
    // API endpoint previously took the session link token or ID. 
    // We'll search by session_token first, then fallback to id.
    let { data, error } = await supabase.from('guardian_sessions').select('*').eq('session_token', token).single();
    if (error || !data) {
        const fallback = await supabase.from('guardian_sessions').select('*').eq('id', token).single();
        data = fallback.data;
        error = fallback.error;
    }
    if (error || !data) throw new Error('Session not found');
    return { session: data };
}

export async function getMyActiveSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return { session: null };

    const { data, error } = await supabase.from('guardian_sessions')
        .select('*')
        .eq('dater_id', session.user.id)
        .eq('is_active', true)
        .single();

    if (error) return { session: null };
    return { session: data };
}

/**
 * Subscribe to real-time guardian session updates via Supabase Channels.
 */
export function subscribeToSession(sessionToken, onUpdate) {
    // Let's deduce if token is session_token or ID
    // Fast path: subscribe changes where id=sessionToken or just refresh via DB
    const channel = supabase.channel(`guardian:${sessionToken}`)
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'guardian_sessions' },
            (payload) => {
                // we have to check if payload matches id or session_token
                if (payload.new.id === sessionToken || payload.new.session_token === sessionToken) {
                    onUpdate({ session: payload.new });
                }
            }
        )
        .subscribe();

    return {
        unsubscribe: () => {
            supabase.removeChannel(channel);
        }
    };
}

export default { analyzeMessageRisk, logRiskAnalysis };
