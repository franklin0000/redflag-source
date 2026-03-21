/**
 * safeRideService.js — SafeRide (PostgreSQL-backed, works across devices)
 *
 * Flow:
 *  1. Sender picks venue → requestRide() creates session in DB → gets sessionId
 *  2. Sender sends chat message with [saferide_invite:sessionId]
 *  3. Receiver taps "Accept" on ANY device → loads session from DB by sessionId
 *  4. Receiver enters pickup address → acceptRide() saves to DB
 *  5. Receiver taps "Open Uber" → deep link opens Uber with pickup+dropoff
 *  6. Session status → en_route; receiver GPS shared via DB polling
 */

const API_BASE        = import.meta.env.VITE_API_URL || '';
const UBER_CLIENT_ID  = import.meta.env.VITE_UBER_CLIENT_ID || '';
const LOCAL_KEY       = 'rf_saferide_sessions'; // legacy key for backward compat

const getLocalSession = (id) => {
  try { return (JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}'))[id] || null; }
  catch { return null; }
};

// ── API helpers ────────────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('rf_token');
  const res   = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── Main service ───────────────────────────────────────────────────────────

export const safeRideService = {

  // Create session in DB (called by sender)
  requestRide: async (_sender_id, receiver_id, match_id, dest_name, dest_address, dest_lat, dest_lng) => {
    const session = await apiFetch('/api/saferide', {
      method: 'POST',
      body: JSON.stringify({ receiver_id, match_id, dest_name, dest_address, dest_lat, dest_lng }),
    });
    return session.id;
  },

  // Load session from DB — falls back to localStorage for old sessions
  getRide: async (session_id) => {
    try {
      return await apiFetch(`/api/saferide/${session_id}`);
    } catch (apiErr) {
      // Fallback: check localStorage (sessions created before DB migration)
      const local = getLocalSession(session_id);
      if (local) return local;
      throw apiErr;
    }
  },

  // Receiver stores their pickup address in DB
  acceptRide: async (session_id, pickup_address, pickup_lat, pickup_lng) => {
    return apiFetch(`/api/saferide/${session_id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        pickup_address,
        pickup_lat,
        pickup_lng,
        status: 'pickup_ready',
      }),
    });
  },

  // Reset pickup so receiver can re-enter their address
  resetPickup: async (session_id) => {
    return apiFetch(`/api/saferide/${session_id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        pickup_address: null,
        pickup_lat: null,
        pickup_lng: null,
        status: 'requested',
      }),
    });
  },

  // Receiver marks the ride as completed
  markArrived: async (session_id) => {
    return apiFetch(`/api/saferide/${session_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'arrived' }),
    }).catch(() => {});
  },

  // Called when receiver taps "Open Uber"
  confirmUberOpened: async (session_id) => {
    return apiFetch(`/api/saferide/${session_id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'en_route',
        driver_name: 'Your Uber Driver',
        car_model: 'See Uber App',
        license_plate: 'See Uber App',
        eta_minutes: 5,
      }),
    }).catch(() => {}); // non-fatal
  },

  // Receiver shares GPS position (written to DB, sender polls it)
  updateReceiverLocation: async (session_id, lat, lng) => {
    return apiFetch(`/api/saferide/${session_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ receiver_lat: lat, receiver_lng: lng }),
    }).catch(() => {}); // non-fatal if GPS update fails
  },

  // Poll DB every 3s — with localStorage fallback for old sessions
  subscribeToRide: (session_id, callback) => {
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const session = await apiFetch(`/api/saferide/${session_id}`);
        if (!cancelled) callback(session);
      } catch {
        // Fallback: try localStorage (old sessions)
        const local = getLocalSession(session_id);
        if (local && !cancelled) callback(local);
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  },

  // GPS sharing: receiver → DB → sender sees it on map
  startGpsSharing: (session_id) => {
    if (!navigator.geolocation) return () => {};

    let watchId = null;

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        safeRideService.updateReceiverLocation(
          session_id,
          pos.coords.latitude,
          pos.coords.longitude
        );
      },
      (err) => {
        console.warn('[SafeRide] GPS error:', err.code, err.message);
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 }
    );

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  },

  // Build Uber deep link with pickup + destination pre-filled.
  // NOTE: Must build URL manually — URLSearchParams encodes [ and ] to %5B/%5D
  // which breaks Uber's parser. Uber requires raw bracket notation.
  getUberDeepLink: (pickupLat, pickupLng, pickupAddress, destLat, destLng, destName, destAddress) => {
    const enc = encodeURIComponent;
    const parts = [
      'action=setPickup',
      ...(UBER_CLIENT_ID ? [`client_id=${enc(UBER_CLIENT_ID)}`] : []),
      `pickup[latitude]=${pickupLat}`,
      `pickup[longitude]=${pickupLng}`,
      `pickup[formatted_address]=${enc(pickupAddress || '')}`,
      `dropoff[latitude]=${destLat}`,
      `dropoff[longitude]=${destLng}`,
      `dropoff[nickname]=${enc(destName || '')}`,
      `dropoff[formatted_address]=${enc(destAddress || destName || '')}`,
    ];
    return `https://m.uber.com/ul/?${parts.join('&')}`;
  },
};
