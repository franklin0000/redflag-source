/**
 * tokenService.js — JWT token utilities for our Express backend
 */

export async function getSecureToken() {
    return localStorage.getItem('rf_token') || null;
}

export async function validateToken() {
    const token = localStorage.getItem('rf_token');
    if (!token) return { valid: false, expiresIn: 0, claims: {} };

    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const expiresAt = payload.exp * 1000;
        const expiresIn = expiresAt - Date.now();
        return {
            valid: expiresIn > 0,
            expiresIn,
            claims: payload,
            expiresAt,
        };
    } catch {
        return { valid: false, expiresIn: 0, claims: {} };
    }
}

export async function getAuthHeaders() {
    const token = await getSecureToken();
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
}

export default { getSecureToken, validateToken, getAuthHeaders };
