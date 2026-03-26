require('dotenv').config();
const express = require('express');
const router = express.Router();
const twilio = require('twilio')(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
const { requireAuth } = require('../middleware/auth');

const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER;
const EMERGENCY_PHONE = process.env.EMERGENCY_PHONE_NUMBER;

// Send SMS Alert
router.post('/sms', requireAuth, async (req, res) => {
  const { to, message } = req.body;
  
  if (!to || !message) {
    return res.status(400).json({ error: 'to and message are required' });
  }

  try {
    const result = await twilio.messages.create({
      body: message,
      from: TWILIO_PHONE,
      to: to
    });
    res.json({ success: true, sid: result.sid, status: result.status });
  } catch (err) {
    console.error('Twilio SMS error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send SOS Alert (to multiple contacts)
router.post('/sos', requireAuth, async (req, res) => {
  const { contacts, location, userName } = req.body;
  
  if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
    return res.status(400).json({ error: 'contacts array is required' });
  }

  const message = `🚨 SOS ALERT from ${userName || 'RedFlag User'}!\nLocation: ${location || 'Unknown'}\nTime: ${new Date().toLocaleString()}`;
  
  const results = [];
  
  for (const contact of contacts) {
    try {
      const result = await twilio.messages.create({
        body: message,
        from: TWILIO_PHONE,
        to: contact.phone
      });
      results.push({ phone: contact.phone, sid: result.sid, status: 'sent' });
    } catch (err) {
      console.error(`SMS error to ${contact.phone}:`, err.message);
      results.push({ phone: contact.phone, error: err.message, status: 'failed' });
    }
  }

  res.json({ results });
});

// Make Emergency Call
router.post('/call/emergency', requireAuth, async (req, res) => {
  const { location, userName } = req.body;
  
  try {
    const call = await twilio.calls.create({
      url: `${process.env.SERVER_URL || 'https://redflag-source.onrender.com'}/api/twilio/voicemail?message=${encodeURIComponent(`SOS Alert from ${userName || 'RedFlag User'}. Location: ${location || 'Unknown'}`)}`,
      to: EMERGENCY_PHONE || TWILIO_PHONE,
      from: TWILIO_PHONE
    });
    res.json({ success: true, sid: call.sid, status: call.status });
  } catch (err) {
    console.error('Twilio Call error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Make Call to Contact
router.post('/call', requireAuth, async (req, res) => {
  const { to, message } = req.body;
  
  if (!to) {
    return res.status(400).json({ error: 'to phone number is required' });
  }

  try {
    const twimlUrl = message 
      ? `${process.env.SERVER_URL || 'https://redflag-source.onrender.com'}/api/twilio/voicemail?message=${encodeURIComponent(message)}`
      : null;

    const call = await twilio.calls.create({
      url: twimlUrl || 'http://twimlbin.com/experimental',
      from: TWILIO_PHONE,
      to: to
    });
    res.json({ success: true, sid: call.sid, status: call.status });
  } catch (err) {
    console.error('Twilio Call error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Escape XML special characters to prevent XML/TwiML injection.
function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Voicemail/Twiml for automated messages
router.post('/voicemail', async (req, res) => {
  const rawMessage = req.query.message || 'This is an automated message from RedFlag.';
  const safeMessage = escapeXml(rawMessage);

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${safeMessage}</Say>
</Response>`;

  res.type('text/xml');
  res.send(twiml);
});

// Video Access Token Generation
// For production stability, uses VideoGrant to authenticate the participant
router.get('/token', requireAuth, async (req, res) => {
  const { room } = req.query;
  const identity = req.user.username || req.user.id;

  if (!room) {
    return res.status(400).json({ error: 'Room name is required' });
  }

  try {
    const AccessToken = require('twilio').jwt.AccessToken;
    const VideoGrant = AccessToken.VideoGrant;

    // Create an Access Token
    const accessToken = new AccessToken(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_API_KEY_SID,
      process.env.TWILIO_API_KEY_SECRET,
      { identity: identity }
    );

    // Create a Video grant and add it to the token
    const videoGrant = new VideoGrant({ room: room });
    accessToken.addGrant(videoGrant);

    // Dynamic ICE Servers for faster connection (Twilio NTS)
    const iceServers = await twilio.tokens.create();

    res.json({ 
      token: accessToken.toJwt(),
      iceServers: iceServers.iceServers
    });
  } catch (err) {
    console.error('Twilio Token error:', err.message);
    res.status(500).json({ error: 'Failed to generate access token' });
  }
});

module.exports = router;
