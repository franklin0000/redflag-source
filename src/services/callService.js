// callService.js — WebRTC via Socket.io (no Supabase)
import SimplePeer from 'simple-peer';
import { getSocket, connectSocket } from './socketService';

let activePeer = null;
let localStream = null;

function socket() {
  return getSocket() || connectSocket();
}

export const callService = {
  initiateCall: async (matchId, userId, type, onStream, onClose) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: type === 'video',
        audio: true,
      });
      localStream = stream;

      const peer = new SimplePeer({ initiator: true, trickle: false, stream });
      activePeer = peer;

      peer.on('signal', data => {
        socket().emit('call:signal', {
          matchId,
          signal: data,
          from: userId,
          type: 'offer',
          callType: type,
        });
      });

      peer.on('stream', remoteStream => { if (onStream) onStream(remoteStream); });
      peer.on('close', () => { cleanupCall(); if (onClose) onClose(); });
      peer.on('error', () => { cleanupCall(); if (onClose) onClose(); });

      return { peer, localStream: stream };
    } catch (err) {
      console.error('Error getting media:', err);
      throw err;
    }
  },

  answerCall: async (matchId, userId, offerSignal, type, onStream, onClose) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: type === 'video',
        audio: true,
      });
      localStream = stream;

      const peer = new SimplePeer({ initiator: false, trickle: false, stream });
      activePeer = peer;

      peer.on('signal', data => {
        socket().emit('call:signal', {
          matchId,
          signal: data,
          from: userId,
          type: 'answer',
        });
      });

      peer.on('stream', remoteStream => { if (onStream) onStream(remoteStream); });
      peer.on('close', () => { cleanupCall(); if (onClose) onClose(); });
      peer.on('error', () => { cleanupCall(); if (onClose) onClose(); });

      peer.signal(offerSignal);
      return { peer, localStream: stream };
    } catch (err) {
      console.error('Error answering call:', err);
      throw err;
    }
  },

  finalizeCall: (signalData) => {
    if (activePeer && !activePeer.destroyed) {
      activePeer.signal(signalData);
    }
  },

  endCall: (matchId) => {
    if (activePeer) activePeer.destroy();
    cleanupCall();
    if (matchId) {
      socket().emit('call:end', { matchId });
    }
  },

  subscribeToSignals: (matchId, userId, onIncomingCall, onAnswer, onEnd) => {
    const s = socket();

    const handleSignal = (payload) => {
      if (payload.matchId !== matchId) return;
      const { signal, from, type, callType } = payload;
      if (from === userId) return;
      if (type === 'offer') onIncomingCall({ signal, from, callType });
      else if (type === 'answer' && onAnswer) onAnswer(signal);
    };

    const handleEnd = (payload) => {
      if (payload.matchId === matchId) {
        if (onEnd) onEnd();
        cleanupCall();
      }
    };

    s.on('call:signal', handleSignal);
    s.on('call:end', handleEnd);

    return () => {
      s.off('call:signal', handleSignal);
      s.off('call:end', handleEnd);
    };
  },
};

function cleanupCall() {
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  activePeer = null;
}
