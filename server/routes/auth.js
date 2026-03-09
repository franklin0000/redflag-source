const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, signRefreshToken, JWT_SECRET } = require('../middleware/auth');
const jwt = require('jsonwebtoken');

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;
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
    const user = rows[0];
    const token = signToken(user.id);
    const refresh = signRefreshToken(user.id);
    await db.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [refresh, user.id]);
    delete user.password_hash;
    delete user.refresh_token;
    res.status(201).json({ user, token, refresh_token: refresh });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
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
    res.status(500).json({ error: err.message });
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

module.exports = router;
