import SimplePeer from 'simple-peer';
import { supabase } from '../lib/supabase';

let activePeer = null;
let localStream = null;
let activeChannel = null;

function getCallChannel(matchId) {
  if (activeChannel && activeChannel.topic === `realtime:call:${matchId}`) {
    return activeChannel;
  }

  if (activeChannel) {
    supabase.removeChannel(activeChannel);
  }

  activeChannel = supabase.channel(`call:${matchId}`);
  activeChannel.subscribe();
  return activeChannel;
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
        const channel = getCallChannel(matchId);
        channel.send({
          type: 'broadcast',
          event: 'call:signal',
          payload: { matchId, signal: data, from: userId, type: 'offer', callType: type }
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
        const channel = getCallChannel(matchId);
        channel.send({
          type: 'broadcast',
          event: 'call:signal',
          payload: { matchId, signal: data, from: userId, type: 'answer' }
        });
      });

      peer.on('stream', remoteStream => { if (onStream) onStream(remoteStream); });
      peer.on('close', () => { cleanupCall(); if (onClose) onClose(); });

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
    if (activePeer) {
      activePeer.destroy();
    }
    cleanupCall();
    if (matchId) {
      const channel = getCallChannel(matchId);
      channel.send({
        type: 'broadcast',
        event: 'call:end',
        payload: { matchId }
      });
    }
  },

  subscribeToSignals: (matchId, userId, onIncomingCall, onAnswer, onEnd) => {
    const channel = getCallChannel(matchId);

    const handleSignal = (payload) => {
      const { signal, from, type, callType } = payload.payload;
      if (from === userId) return;
      if (type === 'offer') onIncomingCall({ signal, from, callType });
      else if (type === 'answer' && onAnswer) onAnswer(signal);
    };

    const handleEnd = () => {
      if (onEnd) onEnd();
      cleanupCall();
    };

    channel.on('broadcast', { event: 'call:signal' }, handleSignal);
    channel.on('broadcast', { event: 'call:end' }, handleEnd);

    return () => {
      // Don't fully remove channel here unless we destroy it completely, 
      // but we need to unsubscribe the specific listeners to prevent memory leaks.
      // Supabase js v2 allows removing specific bindings if we kept the object, 
      // but easier is just closing and nulling the channel if we leave the chat
      if (activeChannel) {
        supabase.removeChannel(activeChannel);
        activeChannel = null;
      }
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
