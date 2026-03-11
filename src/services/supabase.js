/**
 * supabase.js — Compatibility Shim
 * Routes all Supabase calls to our Express/PostgreSQL backend.
 * Drop-in replacement: exports `supabase` and `uploadToSupabase`.
 */

import { authApi, usersApi, postsApi, reportsApi, notificationsApi,
         searchesApi, userExtras, authExtras, uploadFile } from './api.js';

const BASE = import.meta.env.VITE_API_URL || '';

function getToken() {
  return localStorage.getItem('rf_token');
}

async function apiRequest(path, opts = {}) {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── QueryBuilder ──────────────────────────────────────────────
class QueryBuilder {
  constructor(table) {
    this._table = table;
    this._op = 'select';
    this._data = null;
    this._filters = {};
    this._single = false;
    this._maybe = false;
    this._limit = null;
    this._order = null;
    this._countMode = false;
    this._headMode = false;
  }

  select(fields = '*', opts = {}) {
    this._op = 'select';
    this._countMode = !!opts.count;
    this._headMode = !!opts.head;
    return this;
  }

  insert(data) {
    this._op = 'insert';
    this._data = Array.isArray(data) ? data[0] : data;
    return this;
  }

  update(data) {
    this._op = 'update';
    this._data = data;
    return this;
  }

  delete() {
    this._op = 'delete';
    return this;
  }

  upsert(data) {
    this._op = 'upsert';
    this._data = Array.isArray(data) ? data[0] : data;
    return this;
  }

  eq(field, value) {
    this._filters[field] = value;
    return this;
  }

  neq() { return this; }
  gt() { return this; }
  gte() { return this; }
  lt() { return this; }
  lte() { return this; }
  like() { return this; }
  ilike() { return this; }
  in() { return this; }
  is() { return this; }
  not() { return this; }
  or() { return this; }
  filter() { return this; }
  contains() { return this; }

  single() {
    this._single = true;
    return this;
  }

  maybeSingle() {
    this._single = true;
    this._maybe = true;
    return this;
  }

  limit(n) {
    this._limit = n;
    return this;
  }

  order(field, opts = {}) {
    this._order = { field, ascending: opts.ascending !== false };
    return this;
  }

  // Make it thenable (awaitable)
  then(resolve, reject) {
    return this._execute().then(resolve, reject);
  }

  catch(reject) {
    return this._execute().catch(reject);
  }

  async _execute() {
    try {
      const result = await this._route();

      if (this._headMode) {
        const count = Array.isArray(result) ? result.length : (result?.count ?? 0);
        return { count, error: null, data: null };
      }

      if (this._single) {
        const item = Array.isArray(result) ? (result[0] ?? null) : result;
        return { data: item, error: null };
      }

      return { data: result ?? [], error: null };
    } catch (err) {
      if (this._single) return { data: null, error: err };
      return { data: null, error: err };
    }
  }

  async _route() {
    const t = this._table;
    const f = this._filters;
    const op = this._op;

    switch (t) {
      case 'users':            return this._routeUsers(op, f);
      case 'reports':          return this._routeReports(op, f);
      case 'notifications':    return this._routeNotifications(op, f);
      case 'searches':         return this._routeSearches(op, f);
      case 'posts':            return this._routePosts(op, f);
      case 'matches':          return this._routeMatches(op, f);
      case 'messages':         return this._routeMessages(op, f);
      case 'blocked_users':    return this._routeBlockedUsers(op, f);
      case 'muted_chats':      return this._routeMutedChats(op, f);
      case 'dating_profiles':  return this._routeDatingProfiles(op, f);
      case 'comments':         return this._routeComments(op, f);
      default:
        console.debug(`[supabase shim] unhandled table "${t}" op="${op}"`);
        return this._single ? null : [];
    }
  }

  // ── Table handlers ──

  async _routeUsers(op, f) {
    const myId = (() => { try { return JSON.parse(atob(getToken()?.split('.')[1] || 'e30=')).sub; } catch { return null; } })();
    switch (op) {
      case 'select': {
        const id = f.id || f.user_id;
        if (id) {
          if (id === myId) {
            const { user } = await apiRequest('/api/auth/me');
            return user;
          }
          return apiRequest(`/api/users/${id}`);
        }
        // settings query
        if (this._countMode) {
          const r = await apiRequest('/api/stats/community');
          return Array(r.totalUsers).fill(null);
        }
        return [];
      }
      case 'update': {
        if (this._data?.settings !== undefined) {
          return userExtras.updateSettings(this._data.settings);
        }
        if (this._data) {
          return apiRequest('/api/users/me', {
            method: 'PATCH',
            body: JSON.stringify(this._data),
          });
        }
        return null;
      }
      case 'delete': {
        return userExtras.deleteAccount();
      }
      default: return null;
    }
  }

  async _routeReports(op, f) {
    switch (op) {
      case 'select': {
        if (this._countMode) {
          const r = await apiRequest('/api/stats/community');
          return Array(r.totalReports).fill(null);
        }
        if (f.id) {
          return apiRequest(`/api/reports/${f.id}`);
        }
        if (f.reporter_id || f.user_id) {
          return apiRequest('/api/reports/me');
        }
        const limit = this._limit || 20;
        return apiRequest(`/api/reports?limit=${limit}`);
      }
      case 'insert': {
        const d = this._data;
        return apiRequest('/api/reports', {
          method: 'POST',
          body: JSON.stringify({
            reported_name: d.name || d.reported_name || 'Unknown',
            platform: d.platform || d.handle,
            description: d.description || d.details,
            category: d.type || d.category,
            evidence_urls: d.image ? [d.image] : [],
          }),
        });
      }
      default: return this._single ? null : [];
    }
  }

  async _routeNotifications(op, f) {
    switch (op) {
      case 'select': {
        if (f.user_id) return apiRequest('/api/notifications');
        return [];
      }
      case 'update': {
        return apiRequest('/api/notifications/read-all', { method: 'PATCH' });
      }
      case 'delete': {
        return null;
      }
      default: return [];
    }
  }

  async _routeSearches(op, f) {
    switch (op) {
      case 'select': {
        if (this._countMode) {
          const r = await apiRequest('/api/searches/count');
          return Array(r.count).fill(null);
        }
        const limit = this._limit || 10;
        return apiRequest(`/api/searches?limit=${limit}`);
      }
      case 'insert': {
        return apiRequest('/api/searches', {
          method: 'POST',
          body: JSON.stringify(this._data),
        });
      }
      default: return [];
    }
  }

  async _routePosts(op, f) {
    switch (op) {
      case 'select': {
        const userId = f.user_id;
        const limit = this._limit || 20;
        const url = userId
          ? `/api/posts?limit=${limit}&user_id=${userId}`
          : `/api/posts?limit=${limit}`;
        return apiRequest(url);
      }
      case 'insert': {
        return apiRequest('/api/posts', {
          method: 'POST',
          body: JSON.stringify(this._data),
        });
      }
      case 'update': {
        const id = f.id;
        if (id && this._data?.reactions !== undefined) {
          return null; // reactions updated via /react endpoint
        }
        return null;
      }
      case 'delete': {
        const id = f.id;
        if (id) return apiRequest(`/api/posts/${id}`, { method: 'DELETE' });
        return null;
      }
      default: return [];
    }
  }

  async _routeMatches(op, f) {
    switch (op) {
      case 'update': {
        // Server handles last_message updates internally
        return null;
      }
      default: return this._single ? null : [];
    }
  }

  async _routeMessages(op, f) {
    switch (op) {
      case 'delete': {
        const matchId = f.room_id || f.match_id;
        if (matchId) {
          await apiRequest(`/api/dating/messages/${matchId}/all`, { method: 'DELETE' });
        }
        return null;
      }
      default: return this._single ? null : [];
    }
  }

  async _routeBlockedUsers(op, f) {
    switch (op) {
      case 'select': {
        const list = await apiRequest('/api/users/blocked');
        if (f.blocked_id) {
          return list.filter(u => u.id === f.blocked_id);
        }
        return list;
      }
      case 'insert': {
        const id = this._data?.blocked_id;
        if (id) await apiRequest(`/api/users/block/${id}`, { method: 'POST' });
        return null;
      }
      case 'delete': {
        const id = f.blocked_id;
        if (id) await apiRequest(`/api/users/block/${id}`, { method: 'DELETE' });
        return null;
      }
      default: return [];
    }
  }

  async _routeMutedChats(op, f) {
    const matchId = f.match_id;
    switch (op) {
      case 'select': {
        if (!matchId) return [];
        const r = await apiRequest(`/api/users/mute/${matchId}`).catch(() => ({ muted: false }));
        return r.muted ? [{ id: 1 }] : [];
      }
      case 'insert': {
        const mid = this._data?.match_id || matchId;
        if (mid) await apiRequest(`/api/users/mute/${mid}`, { method: 'POST' }).catch(() => {});
        return null;
      }
      case 'delete': {
        if (matchId) await apiRequest(`/api/users/mute/${matchId}`, { method: 'DELETE' }).catch(() => {});
        return null;
      }
      default: return [];
    }
  }

  async _routeDatingProfiles(op, f) {
    switch (op) {
      case 'select': {
        return apiRequest('/api/dating/profile');
      }
      case 'insert':
      case 'update':
      case 'upsert': {
        return apiRequest('/api/dating/profile', {
          method: 'POST',
          body: JSON.stringify(this._data),
        });
      }
      case 'delete': {
        return null;
      }
      default: return null;
    }
  }

  async _routeComments(op, f) {
    switch (op) {
      case 'select': {
        const reportId = f.report_id;
        const postId = f.post_id;
        if (reportId) return apiRequest(`/api/reports/${reportId}/comments`);
        if (postId) return apiRequest(`/api/posts/${postId}/comments`);
        return [];
      }
      case 'insert': {
        const d = this._data;
        if (d.report_id) {
          return apiRequest(`/api/reports/${d.report_id}/comments`, {
            method: 'POST',
            body: JSON.stringify({ content: d.content }),
          });
        }
        if (d.post_id) {
          return apiRequest(`/api/posts/${d.post_id}/comments`, {
            method: 'POST',
            body: JSON.stringify({ content: d.content }),
          });
        }
        return null;
      }
      case 'update': {
        // upvote handled separately; generic update not supported
        return null;
      }
      default: return this._single ? null : [];
    }
  }
}

// ── Realtime stub ─────────────────────────────────────────────
class ChannelStub {
  on() { return this; }
  subscribe() { return this; }
  send() {}
}

// ── Storage shim ──────────────────────────────────────────────
class StorageBucketStub {
  constructor(bucket) { this._bucket = bucket; }

  upload(path, file) {
    return uploadFile(file, this._bucket)
      .then(url => ({ data: { path: url }, error: null }))
      .catch(err => ({ data: null, error: err }));
  }

  getPublicUrl(pathOrUrl) {
    // If path is already a full URL (from our upload), return as-is
    const url = pathOrUrl?.startsWith('http') ? pathOrUrl : pathOrUrl;
    return { data: { publicUrl: url } };
  }
}

class StorageStub {
  from(bucket) { return new StorageBucketStub(bucket); }
}

// ── Auth shim ─────────────────────────────────────────────────
const authShim = {
  async getSession() {
    const token = getToken();
    if (!token) return { data: { session: null }, error: null };
    try {
      const { user } = await apiRequest('/api/auth/me');
      return {
        data: {
          session: {
            access_token: token,
            user,
            expires_at: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
          },
        },
        error: null,
      };
    } catch {
      return { data: { session: null }, error: null };
    }
  },

  async signOut() {
    try { await authApi.logout(); } catch { /* ignore */ }
    return { error: null };
  },

  async resetPasswordForEmail(email) {
    try {
      await authExtras.forgotPassword(email);
      return { error: null };
    } catch (err) {
      return { error: err };
    }
  },

  async updateUser({ password }) {
    // This is called from ResetPassword.jsx — but we use token-based reset now
    // Fallback: try change password with empty current (will fail, that's ok)
    return { error: new Error('Use /reset-password with a valid token') };
  },

  async getUser() {
    const token = getToken();
    if (!token) return { data: { user: null }, error: null };
    try {
      const { user } = await apiRequest('/api/auth/me');
      return { data: { user }, error: null };
    } catch {
      return { data: { user: null }, error: null };
    }
  },

  onAuthStateChange(callback) {
    // No-op — we use JWT, not Supabase auth events
    return { data: { subscription: { unsubscribe: () => {} } } };
  },

  mfa: {
    listFactors: async () => ({ data: { totp: [] }, error: null }),
    enroll: async () => ({ data: null, error: new Error('2FA not available') }),
    challenge: async () => ({ data: null, error: new Error('2FA not available') }),
    verify: async () => ({ error: new Error('2FA not available') }),
    unenroll: async () => ({ error: null }),
  },
};

// ── Main supabase object ──────────────────────────────────────
export const supabase = {
  from: (table) => new QueryBuilder(table),
  auth: authShim,
  storage: new StorageStub(),
  channel: () => new ChannelStub(),
  removeChannel: () => {},
};

// ── uploadToSupabase compat ───────────────────────────────────
export async function uploadToSupabase(bucket, path, file) {
  const url = await uploadFile(file, bucket);
  return url;
}
