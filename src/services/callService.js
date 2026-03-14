// callService.js — WebRTC via Socket.io (no Supabase)
import SimplePeer from 'simple-peer';
import { getSocket, connectSocket } from './socketService';

let activePeer = null;
let localStream = null;
let mediaRecorder = null;
let recordedChunks = [];

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
        console.log('[callService] Emitting call:signal', { matchId, from: userId, type: 'offer', callType: type });
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
      console.log('[callService] Received call:signal:', { payloadMatchId: payload.matchId, expectedMatchId: matchId, from: payload.from, userId });
      if (payload.matchId !== matchId) return;
      const { signal, from, type, callType } = payload;
      if (from === userId) return;
      console.log('[callService] Processing incoming call:', { type, callType });
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

  joinCallRoom: (matchId, onParticipantsUpdate) => {
    const s = socket();
    s.emit('join_video_call', matchId);

    // Backend generates exclusive token for privacy validations
    s.on('call_token_assigned', ({ token, room }) => {
      console.log(`Joined private call room ${room} securely`);
    });

    const handler = (participants) => {
      if (onParticipantsUpdate) onParticipantsUpdate(participants);
    };
    s.on('video_call_participants', handler);

    return () => {
      s.off('video_call_participants', handler);
      s.off('call_token_assigned');
      s.emit('leave_video_call', matchId);
    };
  },

  startRecording: (stream, onDataAvailable) => {
    recordedChunks = [];
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : 'video/webm';

    mediaRecorder = new MediaRecorder(stream, { mimeType });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
        if (onDataAvailable) onDataAvailable(event.data);
      }
    };

    mediaRecorder.start(1000); // Capture every second
    return mediaRecorder;
  },

  stopRecording: () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    return new Blob(recordedChunks, { type: 'video/webm' });
  },

  isRecording: () => {
    return mediaRecorder && mediaRecorder.state === 'recording';
  },

  downloadRecording: (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `call_${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  startScreenShare: async (onStream, onError) => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
        },
        audio: true,
      });

      // Handle when user stops sharing via browser UI
      stream.getVideoTracks()[0].onended = () => {
        if (onStream) onStream(null, true);
      };

      if (onStream) onStream(stream, false);
      return stream;
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        console.log('Screen share cancelled');
      } else {
        console.error('Screen share error:', err);
      }
      if (onError) onError(err);
      return null;
    }
  },

  stopScreenShare: (screenStream) => {
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
    }
  },
};

function cleanupCall() {
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  activePeer = null;
}
