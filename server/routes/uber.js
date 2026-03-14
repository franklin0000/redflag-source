const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// POST /api/uber/callback
// Uber calls this after the user authorizes the app.
// Note: In safeRideService.js, we specified ${window.location.origin}/api/uber/callback
// which translates to a GET or POST. Uber OAuth usually uses a GET to the redirect_uri with a ?code=...
router.get('/callback', async (req, res) => {
    const { code, state: userId } = req.query;

    if (!code) {
        return res.status(400).send('<h1>Uber Auth Failed</h1><p>No code provided.</p>');
    }

    try {
        const response = await axios.post('https://auth.uber.com/oauth/v2/token', null, {
            params: {
                client_id: process.env.VITE_UBER_CLIENT_ID,
                client_secret: process.env.VITE_UBER_CLIENT_SECRET,
                grant_type: 'authorization_code',
                redirect_uri: `${process.env.VITE_API_URL || req.protocol + '://' + req.get('host')}/api/uber/callback`,
                code,
            },
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const { access_token, refresh_token, expires_in } = response.data;

        // Ideally, we'd store this in the database for the user.
        // For now, we'll store it and also return a script to save it in localStorage on the frontend.
        // This aligns with safeRideService.js expecting 'rf_uber_token' in localStorage.

        res.send(`
      <html>
        <body>
          <script>
            localStorage.setItem('rf_uber_token', '${access_token}');
            localStorage.setItem('rf_uber_refresh', '${refresh_token}');
            window.location.href = '/#/dating/chat'; 
          </script>
          <h1>Uber Connected Successfully!</h1>
          <p>Redirecting you back to the app...</p>
        </body>
      </html>
    `);
    } catch (err) {
        console.error('Uber Token Exchange Error:', err.response?.data || err.message);
        res.status(500).send('<h1>Uber Auth Error</h1><p>Failed to exchange code for token.</p>');
    }
});

// GET /api/uber/status
// Check if Uber is connected for the current user
router.get('/status', requireAuth, async (req, res) => {
    // In a real app, check DB. For this demo, we rely on the frontend having the token.
    res.json({ connected: true });
});

module.exports = router;
