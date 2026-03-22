/**
 * Voice Check-In Service
 * Bridge between React and Native Android Voice APIs
 */
import { registerPlugin } from '@capacitor/core';

const VoiceBridge = registerPlugin('VoiceBridge');

export const voiceCheckInService = {
  /**
   * Speak text using Native TTS
   */
  speak: async (text) => {
    try {
      await VoiceBridge.speak({ text });
    } catch (err) {
      console.error('TTS Failed:', err);
      // Fallback to Web Speech API if desired
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'es-ES';
        window.speechSynthesis.speak(utterance);
      }
    }
  },

  /**
   * Listen for voice response
   * @returns {Promise<string>} Transcribed text
   */
  listen: async () => {
    try {
      const result = await VoiceBridge.listen();
      return result.value.toLowerCase();
    } catch (err) {
      console.error('Speech Recognition Failed:', err);
      return '';
    }
  },

  /**
   * Directly call the local emergency number
   */
  callEmergency: async () => {
    try {
      await VoiceBridge.callEmergency();
    } catch (err) {
      console.error('Direct Call Failed:', err);
      // Fallback to tel: link
      window.location.href = 'tel:911'; 
    }
  }
};
