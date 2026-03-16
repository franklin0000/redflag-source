// api.js — Express.js backend client (no Supabase)

const BASE = import.meta.env.VITE_API_URL || '';

// ── TOKEN MANAGEMENT ─────────────────────────────────────────
export const getToken = () => localStorage.getItem('rf_token');
export const setToken = (t) => t ? localStorage.setItem('rf_token', t) : localStorage.removeItem('rf_token');
const getRefreshToken = () => localStorage.getItem('rf_refresh');
const setRefreshToken = (t) => t ? localStorage.setItem('rf_refresh', t) : localStorage.removeItem('rf_refresh');

// ── HTTP REQUEST ──────────────────────────────────────────────
async function request(path, options = {}) {
  const token = getToken();

  const headers = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  let res = await fetch(`${BASE}${path}`, { ...options, headers });

  // Auto-refresh on 401
  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers.Authorization = `Bearer ${getToken()}`;
      res = await fetch(`${BASE}${path}`, { ...options, headers });
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `Request failed (${res.status})`);
  }

  if (res.status === 204) return null;
  const text = await res.text();
  if (!text || !text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
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
  register: (email, password, name, gender) =>
    request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, gender }),
    }),

  login: (email, password) =>
    request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: () =>
    request('/api/auth/logout', { method: 'POST' }).catch(() => {}),

  me: () => request('/api/auth/me'),

  walletLogin: (address) =>
    request('/api/auth/wallet', {
      method: 'POST',
      body: JSON.stringify({ address }),
    }),

  getToken,
  isLoggedIn: () => !!getToken(),
};

// ── USERS ─────────────────────────────────────────────────────
export const usersApi = {
  getMe: () => request('/api/users/me'),
  getUser: (id) => request(`/api/users/${id}`),
  updateMe: (data) => request('/api/users/me', { method: 'PATCH', body: JSON.stringify(data) }),
  verifyIdentity: (gender) => request('/api/users/me/verify', { method: 'POST', body: JSON.stringify({ gender }) }),
  updateSubscription: (isPaid) =>
    request('/api/users/me/subscription', {
      method: 'PATCH',
      body: JSON.stringify({ is_paid: isPaid }),
    }),
  uploadAvatar: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return request('/api/users/avatar', { method: 'POST', body: formData });
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
  getMatchWith: (partnerId) => request(`/api/dating/match-with/${partnerId}`),
  getMessages: (matchId) => request(`/api/dating/messages/${matchId}`),
  sendMessage: (matchId, content, iv) =>
    request(`/api/dating/messages/${matchId}`, {
      method: 'POST',
      body: JSON.stringify({ content, iv }),
    }),
  markRead: (matchId) =>
    request(`/api/dating/messages/${matchId}/read`, { method: 'PATCH' }),
  deleteMessages: (matchId) =>
    request(`/api/dating/messages/${matchId}/all`, { method: 'DELETE' }),
};

// ── POSTS ─────────────────────────────────────────────────────
export const postsApi = {
  getFeed: (limit = 20, offset = 0, room_id) =>
    request(`/api/posts?limit=${limit}&offset=${offset}${room_id ? `&room_id=${room_id}` : ''}`),
  createPost: (content, media_url, room_id, media_type, media_name) =>
    request('/api/posts', { method: 'POST', body: JSON.stringify({ content, media_url, room_id, media_type, media_name }) }),
  deletePost: (id) => request(`/api/posts/${id}`, { method: 'DELETE' }),
  react: (id, emoji) =>
    request(`/api/posts/${id}/react`, { method: 'POST', body: JSON.stringify({ emoji }) }),
  reply: (id, content) =>
    request(`/api/posts/${id}/reply`, { method: 'POST', body: JSON.stringify({ content }) }),
  getComments: (id) => request(`/api/posts/${id}/comments`),
  postComment: (id, content) =>
    request(`/api/posts/${id}/comments`, { method: 'POST', body: JSON.stringify({ content }) }),
};

// ── REPORTS ───────────────────────────────────────────────────
export const reportsApi = {
  getReports: (limit = 20, offset = 0, category) =>
    request(`/api/reports?limit=${limit}&offset=${offset}${category ? `&category=${category}` : ''}`),
  getReport: (id) => request(`/api/reports/${id}`),
  createReport: (data) =>
    request('/api/reports', { method: 'POST', body: JSON.stringify(data) }),
  getMyReports: () => request('/api/reports/me'),
  getCount: () => request('/api/reports/count'),
  upvote: (id) => request(`/api/reports/${id}/upvote`, { method: 'POST' }),
  uploadEvidence: async (reportId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return request(`/api/reports/${reportId}/evidence`, { method: 'POST', body: formData });
  },
  getComments: (reportId) => request(`/api/reports/${reportId}/comments`),
  postComment: (reportId, content) =>
    request(`/api/reports/${reportId}/comments`, { method: 'POST', body: JSON.stringify({ content }) }),
  upvoteComment: (reportId, commentId) =>
    request(`/api/reports/${reportId}/comments/${commentId}/upvote`, { method: 'POST' }),
};

// ── NOTIFICATIONS ─────────────────────────────────────────────
export const notificationsApi = {
  getAll: () => request('/api/notifications'),
  markAllRead: () => request('/api/notifications/read-all', { method: 'PATCH' }),
  getUnreadCount: () => request('/api/notifications/unread-count'),
};

// ── SEARCHES ──────────────────────────────────────────────────
export const searchesApi = {
  getAll: (limit = 10) => request(`/api/searches?limit=${limit}`),
  getCount: () => request('/api/searches/count'),
  create: (query, results) =>
    request('/api/searches', { method: 'POST', body: JSON.stringify({ query, results }) }),
  backgroundCheck: (file, username = '') => {
    const formData = new FormData();
    formData.append('file', file);
    if (username) formData.append('username', username);
    return request('/api/searches/background-check', { method: 'POST', body: formData });
  },
};

// ── STATS ──────────────────────────────────────────────────────
export const statsApi = {
  community: () => request('/api/stats/community'),
  dashboard: () => request('/api/stats/dashboard'),
  activity: () => request('/api/stats/activity'),
};

// ── AUTH EXTRAS ────────────────────────────────────────────────
export const authExtras = {
  forgotPassword: (email) =>
    request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token, password) =>
    request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }),
  changePassword: (current_password, new_password) =>
    request('/api/auth/password', {
      method: 'PATCH',
      body: JSON.stringify({ current_password, new_password }),
    }),
};

// ── USER EXTRAS ────────────────────────────────────────────────
export const userExtras = {
  getSettings: () => request('/api/users/me/settings'),
  updateSettings: (settings) =>
    request('/api/users/me/settings', { method: 'PATCH', body: JSON.stringify(settings) }),
  deleteAccount: () => request('/api/users/me', { method: 'DELETE' }),
  getBlocked: () => request('/api/users/blocked'),
  blockUser: (id) => request(`/api/users/block/${id}`, { method: 'POST' }),
  unblockUser: (id) => request(`/api/users/block/${id}`, { method: 'DELETE' }),
  getMuteStatus: (matchId) => request(`/api/users/mute/${matchId}`),
  muteChat: (matchId) => request(`/api/users/mute/${matchId}`, { method: 'POST' }),
  unmuteChat: (matchId) => request(`/api/users/mute/${matchId}`, { method: 'DELETE' }),
  // Safety History
  getGuardianHistory: () => request('/api/safety/guardian-history'),
  getDateGuardHistory: () => request('/api/safety/date-guard-history'),
  createGuardianSession: (data) => request('/api/safety/guardian-session', { method: 'POST', body: JSON.stringify(data) }),
  updateGuardianSession: (id, data) => request(`/api/safety/guardian-session/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  createDateGuard: (data) => request('/api/safety/date-guard', { method: 'POST', body: JSON.stringify(data) }),
  updateDateGuard: (id, data) => request(`/api/safety/date-guard/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
};

// ── TRUSTED CONTACTS ──────────────────────────────────────────
export const contactsApi = {
  getAll: () => request('/api/contacts'),
  add: (data) => request('/api/contacts', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/api/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id) => request(`/api/contacts/${id}`, { method: 'DELETE' }),
};

// ── GUARDIAN SESSIONS ──────────────────────────────────────────
export const guardianApi = {
  create: (data) => request('/api/guardian/sessions', { method: 'POST', body: JSON.stringify(data) }),
  getMine: () => request('/api/guardian/sessions/mine'),
  getById: (id) => request(`/api/guardian/sessions/${id}`),
  viewByToken: (token) => request(`/api/guardian/view/${token}`),
  updateLocation: (id, lat, lng) =>
    request(`/api/guardian/sessions/${id}/location`, { method: 'PATCH', body: JSON.stringify({ lat, lng }) }),
  checkIn: (id) => request(`/api/guardian/sessions/${id}/checkin`, { method: 'POST' }),
  triggerSOS: (id, location) =>
    request(`/api/guardian/sessions/${id}/sos`, { method: 'POST', body: JSON.stringify({ location }) }),
  cancelSOS: (id) => request(`/api/guardian/sessions/${id}/sos/cancel`, { method: 'POST' }),
  end: (id) => request(`/api/guardian/sessions/${id}/end`, { method: 'POST' }),
};

// ── LOCATION FLAGS ─────────────────────────────────────────────
export const locationFlagsApi = {
  getAll: (lat, lng, radius = 10) =>
    request(`/api/location-flags?lat=${lat}&lng=${lng}&radius=${radius}`),
  create: (data) =>
    request('/api/location-flags', { method: 'POST', body: JSON.stringify(data) }),
  remove: (id) => request(`/api/location-flags/${id}`, { method: 'DELETE' }),
};

// ── FILE UPLOAD (generic) ─────────────────────────────────────
export async function uploadFile(file, folder = 'media') {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', folder);
  const data = await request('/api/upload', { method: 'POST', body: formData });
  return data?.url || null;
}
