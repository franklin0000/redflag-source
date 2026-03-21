/**
 * safeRideService.js — SafeRide
 *
 * How it works:
 *  1. Sender selects a destination venue → requestRide() creates a session
 *  2. Receiver enters their pickup address → acceptRide() geocodes it
 *  3. Receiver taps "Open Uber" → Uber deep link opens with pickup+dropoff pre-filled
 *  4. Once Uber is open, session → 'en_route'. Receiver's GPS is shared via
 *     Socket.io so the sender can see them moving on the map in real time.
 *
 * No Uber API key is required. Uber deep links work on every device worldwide.
 */

const SESSION_KEY = 'rf_saferide_sessions';
const UBER_CLIENT_ID = import.meta.env.VITE_UBER_CLIENT_ID || '';

const getSessions = () => {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || '{}'); } catch { return {}; }
};

const saveSession = (id, data) => {
    const sessions = getSessions();
    sessions[id] = { ...sessions[id], ...data, updated_at: new Date().toISOString() };
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessions));
    return sessions[id];
};

const genId = () => (typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() :
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    }));

export const safeRideService = {

    // ── Deep link → opens Uber app with pickup + dropoff pre-filled ────────
    getUberDeepLink: (pickupLat, pickupLng, pickupAddress, destLat, destLng, destName, destAddress) => {
        const params = new URLSearchParams({
            action: 'setPickup',
            ...(UBER_CLIENT_ID && { client_id: UBER_CLIENT_ID }),
            'pickup[latitude]':          pickupLat,
            'pickup[longitude]':         pickupLng,
            'pickup[formatted_address]': pickupAddress,
            'dropoff[latitude]':         destLat,
            'dropoff[longitude]':        destLng,
            'dropoff[nickname]':         destName,
            'dropoff[formatted_address]': destAddress || destName,
        });
        return `https://m.uber.com/ul/?${params}`;
    },

    // ── Session management ─────────────────────────────────────────────────

    requestRide: async (sender_id, receiver_id, match_id, dest_name, dest_address, dest_lat, dest_lng) => {
        const isValidUUID = (u) =>
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(u);

        const session = {
            id: genId(),
            sender_id:   isValidUUID(sender_id)   ? sender_id   : genId(),
            receiver_id: isValidUUID(receiver_id) ? receiver_id : genId(),
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

    // Called after receiver geocodes their pickup address.
    // Stores pickup coords and moves status → 'pickup_ready'
    acceptRide: async (session_id, pickup_address, pickup_lat, pickup_lng) => {
        const session = getSessions()[session_id];
        if (!session) throw new Error('Session not found');

        return saveSession(session_id, {
            pickup_address,
            pickup_lat,
            pickup_lng,
            status: 'pickup_ready',   // waiting for receiver to open Uber
        });
    },

    // Called when receiver taps "Open Uber". Marks ride as booked.
    confirmUberOpened: (session_id) => {
        saveSession(session_id, {
            status: 'en_route',
            driver_name: 'Your Uber Driver',
            car_model: 'See Uber App',
            license_plate: 'See Uber App',
            eta_minutes: 5,
        });
    },

    // ── Live GPS sharing (receiver → sender via Socket.io) ─────────────────
    // Returns a cleanup function. Caller must provide their socket instance.
    startGpsSharing: (session_id, socket) => {
        if (!navigator.geolocation || !socket) return () => {};

        let watchId = null;

        const sendLocation = (pos) => {
            const { latitude, longitude } = pos.coords;
            // Update local session so sender map refreshes via subscribeToRide
            saveSession(session_id, {
                receiver_lat: latitude,
                receiver_lng: longitude,
                status: getSessions()[session_id]?.status || 'en_route',
            });
            // Broadcast via socket for the sender's browser
            socket.emit('saferide:location', { session_id, lat: latitude, lng: longitude });
        };

        watchId = navigator.geolocation.watchPosition(sendLocation, null, {
            enableHighAccuracy: true,
            maximumAge: 15000,
            timeout: 10000,
        });

        return () => {
            if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        };
    },

    // ── Polling subscription (drives UI updates, works across tabs) ────────
    subscribeToRide: (session_id, callback) => {
        let cancelled = false;

        const poll = () => {
            if (cancelled) return;
            const session = getSessions()[session_id];
            if (session) callback(session);
        };

        poll();
        const interval = setInterval(poll, 2000);
        return () => { cancelled = true; clearInterval(interval); };
    },

    getRide: async (session_id) => {
        const data = getSessions()[session_id];
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
};
