// ── RedFlag API Client ─────────────────────────────────────────
// Replaces all Supabase calls with calls to our own Render backend

const BASE = import.meta.env.VITE_API_URL || '';

function getToken() {
  return localStorage.getItem('rf_token');
}

function setToken(token) {
  if (token) localStorage.setItem('rf_token', token);
  else localStorage.removeItem('rf_token');
}

function setRefreshToken(token) {
  if (token) localStorage.setItem('rf_refresh', token);
  else localStorage.removeItem('rf_refresh');
}

function getRefreshToken() {
  return localStorage.getItem('rf_refresh');
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  // Auto-refresh on 401
  if (res.status === 401 && getRefreshToken()) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers.Authorization = `Bearer ${getToken()}`;
      const retry = await fetch(`${BASE}${path}`, { ...options, headers });
      if (!retry.ok) {
        const err = await retry.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || 'Request failed');
      }
      return retry.json();
    } else {
      setToken(null);
      setRefreshToken(null);
      window.location.hash = '/login';
      throw new Error('Session expired');
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }

  if (res.status === 204) return null;
  return res.json();
}

async function tryRefresh() {
  const refresh_token = getRefreshToken();
  if (!refresh_token) return false;
  try {
    const res = await fetch(`${BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    setToken(data.token);
    setRefreshToken(data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

// ── AUTH ──────────────────────────────────────────────────────
export const authApi = {
  register: (email, password, name) =>
    request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }),

  login: async (email, password) => {
    const data = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    setRefreshToken(data.refresh_token);
    return data;
  },

  logout: async () => {
    try {
      await request('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: getRefreshToken() }),
      });
    } finally {
      setToken(null);
      setRefreshToken(null);
    }
  },

  me: () => request('/api/auth/me'),

  getToken,
  setToken,
  setRefreshToken,
  isLoggedIn: () => !!getToken(),
};

// ── USERS ─────────────────────────────────────────────────────
export const usersApi = {
  getUser: (id) => request(`/api/users/${id}`),
  updateMe: (data) => request('/api/users/me', { method: 'PATCH', body: JSON.stringify(data) }),
  updateSubscription: (isPaid) =>
    request('/api/users/me/subscription', {
      method: 'PATCH',
      body: JSON.stringify({ is_paid: isPaid }),
    }),
  uploadAvatar: async (file) => {
    const form = new FormData();
    form.append('file', file);
    form.append('folder', 'avatars');
    const token = getToken();
    const res = await fetch(`${BASE}/api/users/avatar`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    if (!res.ok) throw new Error('Upload failed');
    return res.json();
  },
};

// ── DATING ────────────────────────────────────────────────────
export const datingApi = {
  getMyProfile: () => request('/api/dating/profile'),
  saveProfile: (data) =>
    request('/api/dating/profile', { method: 'POST', body: JSON.stringify(data) }),
  getPotentialMatches: (lat, lng, mode = 'local') =>
    request(`/api/dating/matches/potential?lat=${lat}&lng=${lng}&mode=${mode}`),
  swipe: (target_id, direction) =>
    request('/api/dating/swipe', { method: 'POST', body: JSON.stringify({ target_id, direction }) }),
  getMatches: () => request('/api/dating/matches'),
  getMessages: (matchId) => request(`/api/dating/messages/${matchId}`),
  sendMessage: (matchId, content, iv) =>
    request(`/api/dating/messages/${matchId}`, {
      method: 'POST',
      body: JSON.stringify({ content, iv }),
    }),
  markRead: (matchId) =>
    request(`/api/dating/messages/${matchId}/read`, { method: 'PATCH' }),
};

// ── POSTS ─────────────────────────────────────────────────────
export const postsApi = {
  getFeed: (limit = 20, offset = 0) => request(`/api/posts?limit=${limit}&offset=${offset}`),
  createPost: (content, media_url) =>
    request('/api/posts', { method: 'POST', body: JSON.stringify({ content, media_url }) }),
  deletePost: (id) => request(`/api/posts/${id}`, { method: 'DELETE' }),
  react: (id, emoji) =>
    request(`/api/posts/${id}/react`, { method: 'POST', body: JSON.stringify({ emoji }) }),
  reply: (id, content) =>
    request(`/api/posts/${id}/reply`, { method: 'POST', body: JSON.stringify({ content }) }),
};

// ── REPORTS ───────────────────────────────────────────────────
export const reportsApi = {
  getReports: (limit = 20, offset = 0, category) =>
    request(`/api/reports?limit=${limit}&offset=${offset}${category ? `&category=${category}` : ''}`),
  createReport: (data) =>
    request('/api/reports', { method: 'POST', body: JSON.stringify(data) }),
  getMyReports: () => request('/api/reports/me'),
  upvote: (id) => request(`/api/reports/${id}/upvote`, { method: 'POST' }),
  uploadEvidence: async (reportId, file) => {
    const form = new FormData();
    form.append('file', file);
    form.append('folder', 'evidence');
    const token = getToken();
    const res = await fetch(`${BASE}/api/reports/${reportId}/evidence`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    if (!res.ok) throw new Error('Upload failed');
    return res.json();
  },
};

// ── NOTIFICATIONS ─────────────────────────────────────────────
export const notificationsApi = {
  getAll: () => request('/api/notifications'),
  markAllRead: () => request('/api/notifications/read-all', { method: 'PATCH' }),
  getUnreadCount: () => request('/api/notifications/unread-count'),
};

// ── FILE UPLOAD (generic) ─────────────────────────────────────
export async function uploadFile(file, folder = 'media') {
  const form = new FormData();
  form.append('file', file);
  form.append('folder', folder);
  const token = getToken();
  const res = await fetch(`${BASE}/api/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) throw new Error('Upload failed');
  const data = await res.json();
  return data.url;
}
