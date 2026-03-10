const router = require('express').Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');

// GET /api/users/me — return current user profile
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, username, avatar_url, bio, is_paid, is_verified,
              is_verified_web3, safety_score, location, created_at, last_seen, settings
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, username, avatar_url, bio, is_paid, is_verified,
              is_verified_web3, safety_score, location, created_at, last_seen
       FROM users WHERE id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/users/me — update profile
router.patch('/me', requireAuth, async (req, res) => {
  const { name, bio, location, lat, lng, avatar_url } = req.body;
  try {
    const { rows } = await db.query(
      `UPDATE users SET
         name = COALESCE($1, name),
         bio = COALESCE($2, bio),
         location = COALESCE($3, location),
         lat = COALESCE($4, lat),
         lng = COALESCE($5, lng),
         avatar_url = COALESCE($6, avatar_url),
         last_seen = NOW()
       WHERE id = $7 RETURNING id, name, username, avatar_url, bio, is_paid, is_verified,
         is_verified_web3, safety_score, location, lat, lng, email, created_at`,
      [name, bio, location, lat, lng, avatar_url, req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/avatar — upload avatar photo
router.post('/avatar', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.fileUrl) return res.status(400).json({ error: 'Upload failed' });
    const { rows } = await db.query(
      'UPDATE users SET avatar_url = $1 WHERE id = $2 RETURNING avatar_url',
      [req.fileUrl, req.user.id]
    );
    res.json({ url: rows[0].avatar_url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/users/me/subscription
router.patch('/me/subscription', requireAuth, async (req, res) => {
  const { is_paid } = req.body;
  try {
    const { rows } = await db.query(
      'UPDATE users SET is_paid = $1 WHERE id = $2 RETURNING id, is_paid',
      [Boolean(is_paid), req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/me — delete account
router.delete('/me', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM users WHERE id = $1', [req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/me/settings
router.get('/me/settings', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT settings FROM users WHERE id = $1', [req.user.id]);
    res.json(rows[0]?.settings || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/users/me/settings
router.patch('/me/settings', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE users SET settings = COALESCE(settings, '{}') || $1::jsonb WHERE id = $2 RETURNING settings`,
      [JSON.stringify(req.body), req.user.id]
    );
    res.json(rows[0].settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/blocked
router.get('/blocked', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.name, u.username, u.avatar_url
       FROM blocked_users b JOIN users u ON u.id = b.blocked_id
       WHERE b.blocker_id = $1`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/block/:id
router.post('/block/:id', requireAuth, async (req, res) => {
  try {
    await db.query(
      'INSERT INTO blocked_users (blocker_id, blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [req.user.id, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/block/:id
router.delete('/block/:id', requireAuth, async (req, res) => {
  try {
    await db.query(
      'DELETE FROM blocked_users WHERE blocker_id = $1 AND blocked_id = $2',
      [req.user.id, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/mute/:matchId
router.get('/mute/:matchId', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT 1 FROM muted_chats WHERE user_id = $1 AND match_id = $2',
      [req.user.id, req.params.matchId]
    );
    res.json({ muted: rows.length > 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/mute/:matchId
router.post('/mute/:matchId', requireAuth, async (req, res) => {
  try {
    await db.query(
      'INSERT INTO muted_chats (user_id, match_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [req.user.id, req.params.matchId]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/mute/:matchId
router.delete('/mute/:matchId', requireAuth, async (req, res) => {
  try {
    await db.query(
      'DELETE FROM muted_chats WHERE user_id = $1 AND match_id = $2',
      [req.user.id, req.params.matchId]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
