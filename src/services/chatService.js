// chatService.js — Socket.io real-time chat (replaces Supabase Realtime)
import { io } from 'socket.io-client';
import { datingApi, authApi } from './api';

const BASE = import.meta.env.VITE_API_URL || '';

let socket = null;

function getSocket() {
    if (!socket || socket.disconnected) {
        socket = io(BASE || window.location.origin, {
            auth: { token: authApi.getToken() },
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
        });
        socket.on('connect_error', (err) => {
            console.warn('Socket connect error:', err.message);
        });
    }
    return socket;
}

export function subscribeToMessages(matchId, callback) {
    const s = getSocket();
    s.emit('join_match', matchId);

    const handler = (message) => {
        callback(prev => {
            const list = Array.isArray(prev) ? prev : [];
            if (list.find(m => m.id === message.id)) return list;
            return [...list, message];
        });
    };

    s.on('new_message', handler);

    // Load existing messages via REST on subscribe
    datingApi.getMessages(matchId)
        .then(msgs => { if (Array.isArray(msgs)) callback(msgs); })
        .catch(console.error);

    return () => { s.off('new_message', handler); };
}

export async function sendMessage(matchId, content, iv = null) {
    const s = getSocket();
    if (s.connected) {
        s.emit('send_message', { matchId, content, iv });
        return { id: crypto.randomUUID(), matchId, content, iv, created_at: new Date().toISOString() };
    }
    // REST fallback when socket disconnected
    return datingApi.sendMessage(matchId, content, iv);
}

export function subscribeToTyping(matchId, callback) {
    const s = getSocket();
    const handler = (data) => callback(data);
    s.on('user_typing', handler);
    return () => s.off('user_typing', handler);
}

export function sendTyping(matchId, isTyping) {
    const s = getSocket();
    if (s.connected) s.emit('typing', { matchId, isTyping });
}

export function disconnectSocket() {
    if (socket) { socket.disconnect(); socket = null; }
}

// Legacy compat exports for non-dating chat (ChatRoom.jsx)
export async function uploadChatAttachment(file, matchId) {
    const { uploadFile } = await import('./api');
    return uploadFile(file, `redflag/chat/${matchId}`);
}

export function generateNickname() {
    const adj = ['Silent','Red','Night','Steel','Dark','Swift'];
    const noun = ['Fox','Wolf','Hawk','Storm','Echo','Cipher'];
    return adj[Math.floor(Math.random() * adj.length)] + noun[Math.floor(Math.random() * noun.length)] + Math.floor(Math.random() * 99);
}
