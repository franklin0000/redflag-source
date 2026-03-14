// socketService.js — Socket.io singleton (non-React, importable anywhere)
import { io } from 'socket.io-client';
import { getToken } from './api';

const BASE = import.meta.env.VITE_API_URL || '';

let socket = null;

export function connectSocket() {
  if (socket?.connected) return socket;

  // If socket exists but disconnected, reconnect with fresh token
  if (socket) {
    socket.auth = { token: getToken() };
    socket.connect();
    return socket;
  }

  socket = io(BASE, {
    auth: { token: getToken() },
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
  });

  socket.on('connect_error', (err) => {
    console.warn('[Socket] Connection error:', err.message);
  });

  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
