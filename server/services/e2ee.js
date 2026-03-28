// ── E2EE Service — transparent pass-through ──────────────────────────────────
// Real Signal Protocol E2EE requires client-side key generation and exchange.
// Until that is implemented, messages are stored as plain UTF-8 (no false
// encryption promises to users).  The interface is kept stable so a real
// implementation can be swapped in without changing call sites.

/**
 * "Encrypts" a message — currently a transparent pass-through.
 * Returns a structure compatible with the dating route's send/receive flow.
 * @param {string} _senderId
 * @param {string} _recipientId
 * @param {string} message
 */
async function encryptMessage(_senderId, _recipientId, message) {
  return {
    type: 1,
    body: Buffer.from(message, 'utf8').toString('base64'),
    registrationId: 0,
  };
}

/**
 * "Decrypts" a message — base64 decodes the stored body.
 * @param {string} _senderId
 * @param {string} _recipientId
 * @param {object} cipherData
 */
async function decryptMessage(_senderId, _recipientId, cipherData) {
  if (!cipherData?.body) return '';
  try {
    return Buffer.from(cipherData.body, 'base64').toString('utf8');
  } catch {
    return cipherData.body;
  }
}

module.exports = { encryptMessage, decryptMessage };
