const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db');
const { signToken, signRefreshToken, JWT_SECRET } = require('../middleware/auth');
const jwt = require('jsonwebtoken');
const { sendPasswordResetEmail } = require('../services/emailService');

const rateLimit = require('express-rate-limit');
const makeLimit = (max, windowMin = 15) =>
  rateLimit({ windowMs: windowMin * 60 * 1000, max, standardHeaders: true, legacyHeaders: false });
const loginLimiter = makeLimit(10, 15);     // 10 attempts per 15 min
const registerLimiter = makeLimit(5, 60);   // 5 registrations per hour
const resetLimiter = makeLimit(3, 60);      // 3 reset requests per hour

// POST /api/auth/register
router.post('/register', registerLimiter, async (req, res) => {
  const { email, password, name, gender } = req.body;
  if (!email || !password || !name)
    return res.status(400).json({ error: 'email, password, name required' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const exists = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (exists.rows.length) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 12);
    const username = name.toLowerCase().replace(/\s+/g, '') + Math.floor(Math.random() * 9999);
    const { rows } = await db.query(
      `INSERT INTO users (email, password_hash, name, username)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [email.toLowerCase(), hash, name, username]
    );
    // Save gender to dating profile immediately if provided
    const userId = rows[0].id;
    if (gender) {
      await db.query(
        `INSERT INTO dating_profiles (user_id, gender) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET gender = $2`,
        [userId, gender]
      ).catch(() => {}); // non-fatal if dating_profiles table isn't ready yet
    }
    const user = rows[0];
    const token = signToken(user.id);
    const refresh = signRefreshToken(user.id);
    await db.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [refresh, user.id]);
    delete user.password_hash;
    delete user.refresh_token;
    res.status(201).json({ user, token, refresh_token: refresh });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'email and password required' });
  try {
    const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken(user.id);
    const refresh = signRefreshToken(user.id);
    await db.query('UPDATE users SET refresh_token = $1, last_seen = NOW() WHERE id = $2', [refresh, user.id]);
    delete user.password_hash;
    delete user.refresh_token;
    res.json({ user, token, refresh_token: refresh });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(400).json({ error: 'refresh_token required' });
  try {
    const payload = jwt.verify(refresh_token, JWT_SECRET);
    const { rows } = await db.query(
      'SELECT * FROM users WHERE id = $1 AND refresh_token = $2',
      [payload.sub, refresh_token]
    );
    if (!rows.length) return res.status(401).json({ error: 'Invalid refresh token' });
    const user = rows[0];
    const token = signToken(user.id);
    const newRefresh = signRefreshToken(user.id);
    await db.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [newRefresh, user.id]);
    delete user.password_hash;
    delete user.refresh_token;
    res.json({ user, token, refresh_token: newRefresh });
  } catch {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  const { refresh_token } = req.body;
  if (refresh_token) {
    try {
      const payload = jwt.verify(refresh_token, JWT_SECRET);
      await db.query('UPDATE users SET refresh_token = NULL WHERE id = $1', [payload.sub]);
    } catch {}
  }
  res.json({ message: 'Logged out' });
});

// GET /api/auth/me
router.get('/me', require('../middleware/auth').requireAuth, async (req, res) => {
  const user = { ...req.user };
  delete user.password_hash;
  delete user.refresh_token;
  res.json({ user });
});

// POST /api/auth/forgot-password
router.post('/forgot-password', resetLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    const { rows } = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (!rows.length) return res.json({ message: 'If that email exists, a reset link was sent.' });

    const token = crypto.randomBytes(32).toString('hex');
    const exp = new Date(Date.now() + 3600 * 1000); // 1 hour
    await db.query(
      'UPDATE users SET reset_token = $1, reset_token_exp = $2 WHERE id = $3',
      [token, exp, rows[0].id]
    );
    // Send password reset email (async, non-blocking — user gets response immediately)
    const appBase = process.env.FRONTEND_URL
      || process.env.VITE_API_URL
      || `${req.protocol}://${req.get('host')}`;
    sendPasswordResetEmail(email.toLowerCase(), token, appBase).catch((err) => {
      console.error('[Email] Failed to send reset email:', err.message);
    });
    res.json({ message: 'If that email exists, a reset link was sent.' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'token and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const { rows } = await db.query(
      'SELECT id FROM users WHERE reset_token = $1 AND reset_token_exp > NOW()',
      [token]
    );
    if (!rows.length) return res.status(400).json({ error: 'Invalid or expired token' });
    const hash = await bcrypt.hash(password, 12);
    await db.query(
      'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_exp = NULL WHERE id = $2',
      [hash, rows[0].id]
    );
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/wallet — Wallet-based authentication (SIWE)
router.post('/wallet', async (req, res) => {
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: 'address required' });
  const normalizedAddress = address.toLowerCase();
  const walletEmail = `${normalizedAddress}@wallet.redflag.app`;
  try {
    let { rows } = await db.query(
      'SELECT * FROM users WHERE wallet_address = $1 OR email = $2',
      [normalizedAddress, walletEmail]
    );
    let user = rows[0];
    if (!user) {
      const shortAddr = `${normalizedAddress.slice(0, 6)}...${normalizedAddress.slice(-4)}`;
      const username = 'wallet_' + normalizedAddress.slice(2, 8) + Math.floor(Math.random() * 999);
      const { rows: newRows } = await db.query(
        `INSERT INTO users (email, name, username, wallet_address, is_verified_web3, password_hash)
         VALUES ($1, $2, $3, $4, true, $5) RETURNING *`,
        [walletEmail, shortAddr, username, normalizedAddress, await bcrypt.hash(normalizedAddress + JWT_SECRET, 12)]
      );
      user = newRows[0];
    } else if (!user.wallet_address) {
      await db.query('UPDATE users SET wallet_address = $1, is_verified_web3 = true WHERE id = $2', [normalizedAddress, user.id]);
      user.wallet_address = normalizedAddress;
      user.is_verified_web3 = true;
    }
    const token = signToken(user.id);
    const refresh = signRefreshToken(user.id);
    await db.query('UPDATE users SET refresh_token = $1, last_seen = NOW() WHERE id = $2', [refresh, user.id]);
    delete user.password_hash;
    delete user.refresh_token;
    res.json({ user, token, refresh_token: refresh });
  } catch (err) {
    console.error('Wallet auth error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/auth/password — change password (authenticated)
router.patch('/password', require('../middleware/auth').requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password)
    return res.status(400).json({ error: 'current_password and new_password required' });
  if (new_password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
    const hash = await bcrypt.hash(new_password, 12);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
