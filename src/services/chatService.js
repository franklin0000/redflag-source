// chatService.js — Socket.io + REST API (no Supabase)
import { getSocket, connectSocket } from './socketService';
import { datingApi, uploadFile } from './api';

function socket() {
  return getSocket() || connectSocket();
}

// ── Dating Chat ───────────────────────────────────────────────

export function subscribeToMessages(matchId, callback) {
  const s = socket();

  // Load message history via REST
  datingApi.getMessages(matchId)
    .then(data => { if (data) callback(data); })
    .catch(() => {});

  // Join the match room
  s.emit('join_match', matchId);

  // Listen for real-time new messages
  const handler = (msg) => {
    if (msg.match_id === matchId || msg.room_id === matchId) {
      callback(prev => {
        const list = Array.isArray(prev) ? prev : [];
        if (list.find(m => m.id === msg.id)) return list;
        return [...list, msg];
      });
    }
  };
  s.on('new_message', handler);

  return () => {
    s.off('new_message', handler);
  };
}

export async function sendMessage(matchId, content, iv = null) {
  return datingApi.sendMessage(matchId, content, iv);
}

export function subscribeToTyping(matchId, callback) {
  const s = socket();
  const handler = (payload) => {
    if (payload.matchId === matchId) callback(payload);
  };
  s.on('typing', handler);
  return () => s.off('typing', handler);
}

export async function sendTyping(matchId, isTyping) {
  socket().emit('typing', { matchId, isTyping });
}

// ── Anonymous Chat ────────────────────────────────────────────

export function subscribeToAnonMessages(room, callback) {
  const s = socket();

  // Join anon room
  s.emit('join_anon', room);

  const handler = (msg) => {
    if (msg.room_id === room || msg.room === room) {
      callback(prev => {
        const list = Array.isArray(prev) ? prev : [];
        if (list.find(m => m.id === msg.id)) return list;
        return [...list, msg];
      });
    }
  };
  s.on('new_anon_message', handler);

  return () => s.off('new_anon_message', handler);
}

export async function sendAnonMessage(room, text, nickname, avatar, attachment = null, type = 'text') {
  socket().emit('send_anon_message', {
    room,
    text,
    nickname,
    avatar,
    attachment,
    type,
  });
}

export async function uploadChatAttachment(file, matchId) {
  const url = await uploadFile(file, `chat/${matchId}`);
  return url;
}

// ── Utilities ─────────────────────────────────────────────────

export function generateNickname() {
  const adj = ['Silent', 'Red', 'Night', 'Steel', 'Dark', 'Swift'];
  const noun = ['Fox', 'Wolf', 'Hawk', 'Storm', 'Echo', 'Cipher'];
  const emojis = ['🦊', '🐺', '🦅', '⚡', '🌙', '🔥', '💎', '🌀'];
  const name = adj[Math.floor(Math.random() * adj.length)] + noun[Math.floor(Math.random() * noun.length)] + Math.floor(Math.random() * 99);
  const emoji = emojis[Math.floor(Math.random() * emojis.length)];
  return { name, emoji };
}
