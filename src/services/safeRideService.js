/**
 * safeRideService.js — SafeRide (localStorage-backed, demo mode)
 */

const SESSION_KEY = 'rf_saferide_sessions';

const getSessions = () => {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || '{}'); } catch { return {}; }
};

const saveSession = (id, data) => {
    const sessions = getSessions();
    sessions[id] = { ...sessions[id], ...data, updated_at: new Date().toISOString() };
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessions));
    return sessions[id];
};

const genId = () => crypto.randomUUID ? crypto.randomUUID() :
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });

export const safeRideService = {

    isUberConnected: async () => {
        // In demo mode (no VITE_UBER_CLIENT_ID), always connected
        if (!import.meta.env.VITE_UBER_CLIENT_ID) return true;
        return !!localStorage.getItem('rf_uber_token');
    },

    getUberAuthUrl: (userId) => {
        const clientId = import.meta.env.VITE_UBER_CLIENT_ID;
        const redirectUri = `${window.location.origin}/api/uber/callback`;
        return `https://auth.uber.com/oauth/v2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=request&state=${userId}`;
    },

    requestRide: async (sender_id, receiver_id, match_id, dest_name, dest_address, dest_lat, dest_lng) => {
        const isValidUUID = (uuid) =>
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);

        const session = {
            id: genId(),
            sender_id: isValidUUID(sender_id) ? sender_id : '00000000-0000-0000-0000-000000000001',
            receiver_id: isValidUUID(receiver_id) ? receiver_id : '00000000-0000-0000-0000-000000000002',
            match_id,
            dest_name,
            dest_address,
            dest_lat,
            dest_lng,
            status: 'requested',
            created_at: new Date().toISOString(),
        };

        saveSession(session.id, session);
        return session.id;
    },

    acceptRide: async (session_id, pickup_address, pickup_lat, pickup_lng) => {
        const sessionData = saveSession(session_id, {
            pickup_address,
            pickup_lat,
            pickup_lng,
            status: 'processing',
        });

        const session = getSessions()[session_id];
        if (!session) throw new Error('Session not found');

        const isDemo = !import.meta.env.VITE_UBER_CLIENT_ID ||
            session.sender_id === '00000000-0000-0000-0000-000000000001' ||
            session.receiver_id === '00000000-0000-0000-0000-000000000002';

        if (isDemo) {
            console.log('SafeRide DEMO MODE: Bypassing Uber API');
            const initialCarLat = pickup_lat - 0.005;
            const initialCarLng = pickup_lng - 0.005;

            saveSession(session_id, {
                status: 'en_route',
                eta_minutes: 3,
                car_lat: initialCarLat,
                car_lng: initialCarLng,
                driver_name: 'Juan Perez',
                car_model: 'Toyota Prius (Demo)',
                license_plate: 'DEMO-123',
            });

            safeRideService._simulateDrive(session_id, initialCarLat, initialCarLng, pickup_lat, pickup_lng);
            return sessionData;
        }

        // Real Uber API (not implemented in this deployment)
        throw new Error('Uber API not configured. Set VITE_UBER_CLIENT_ID to enable.');
    },

    subscribeToRide: (session_id, callback) => {
        let cancelled = false;

        const poll = () => {
            if (cancelled) return;
            const sessions = getSessions();
            const session = sessions[session_id];
            if (session) callback(session);
        };

        poll();
        const interval = setInterval(poll, 2000);

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    },

    getRide: async (session_id) => {
        const sessions = getSessions();
        const data = sessions[session_id];
        if (!data) throw new Error('Session not found');
        return data;
    },

    updateCarLocation: async (session_id, newLat, newLng, newEta) => {
        saveSession(session_id, {
            car_lat: newLat,
            car_lng: newLng,
            eta_minutes: newEta > 0 ? newEta : 0,
            status: newEta <= 0 ? 'arrived' : 'en_route',
        });
    },

    _simulateDrive: (session_id, startLat, startLng, endLat, endLng) => {
        let currentLat = startLat;
        let currentLng = startLng;
        let eta = 3;

        const steps = 10;
        const latStep = (endLat - startLat) / steps;
        const lngStep = (endLng - startLng) / steps;
        let stepCount = 0;

        const interval = setInterval(async () => {
            stepCount++;
            currentLat += latStep;
            currentLng += lngStep;

            if (stepCount % 3 === 0) eta--;

            if (stepCount >= steps) {
                clearInterval(interval);
                await safeRideService.updateCarLocation(session_id, endLat, endLng, 0);
            } else {
                await safeRideService.updateCarLocation(session_id, currentLat, currentLng, Math.max(1, eta));
            }
        }, 3000);
    },
};
