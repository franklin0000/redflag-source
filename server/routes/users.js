const router = require('express').Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');

// GET /api/users/me — return current user profile
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.name, u.username, u.avatar_url, u.bio, u.is_paid, u.is_verified,
              u.is_verified_web3, u.safety_score, u.location, u.created_at, u.last_seen, u.settings,
              dp.gender
       FROM users u
       LEFT JOIN dating_profiles dp ON dp.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/blocked — MUST be before /:id wildcard to avoid mis-routing
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
  const { name, bio, location, lat, lng, avatar_url, photo_url, is_paid, is_verified_web3, gender, wallet_address } = req.body;
  try {
    const { rows } = await db.query(
      `UPDATE users SET
         name = COALESCE($1, name),
         bio = COALESCE($2, bio),
         location = COALESCE($3, location),
         lat = COALESCE($4, lat),
         lng = COALESCE($5, lng),
         avatar_url = COALESCE($6, COALESCE($7, avatar_url)),
         is_paid = COALESCE($8, is_paid),
         is_verified_web3 = COALESCE($9, is_verified_web3),
         wallet_address = COALESCE($10, wallet_address),
         last_seen = NOW()
       WHERE id = $11 RETURNING id, name, username, avatar_url, bio, is_paid, is_verified,
         is_verified_web3, safety_score, location, lat, lng, email, wallet_address, created_at`,
      [name, bio, location, lat, lng, avatar_url, photo_url, is_paid, is_verified_web3, wallet_address, req.user.id]
    );
    // Update gender in dating_profiles if provided
    if (gender) {
      await db.query(
        `INSERT INTO dating_profiles (user_id, gender) VALUES ($1,$2)
         ON CONFLICT (user_id) DO UPDATE SET gender=$2`,
        [req.user.id, gender]
      ).catch(() => {});
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/verify-gender — AI gender verification using profile photo
// Runs DeepFace on the user's avatar, compares with declared gender in dating_profiles.
// On success sets gender_verified = true in dating_profiles.
router.post('/verify-gender', requireAuth, async (req, res) => {
  const { spawn } = require('child_process');
  const path = require('path');

  const photoUrl = req.user.avatar_url || req.user.photo_url;
  if (!photoUrl) {
    return res.status(400).json({ error: 'No profile photo found. Please upload a profile photo first.' });
  }

  // Get declared gender from dating_profiles
  const { rows: dpRows } = await db.query(
    'SELECT gender FROM dating_profiles WHERE user_id = $1',
    [req.user.id]
  );
  const declaredGender = dpRows[0]?.gender;
  if (!declaredGender) {
    return res.status(400).json({ error: 'Gender not set. Please select your gender first.' });
  }

  // Run Python verify_gender.py
  const scriptPath = path.join(__dirname, '..', 'python', 'verify_gender.py');
  const result = await new Promise((resolve) => {
    const py = spawn('python3', [scriptPath, photoUrl, declaredGender], { env: process.env });
    let out = '', err = '';
    py.stdout.on('data', d => { out += d.toString(); });
    py.stderr.on('data', d => { err += d.toString(); });
    py.on('error', () => resolve({ error: 'Python script not found' }));
    py.on('close', () => {
      try { resolve(JSON.parse(out)); }
      catch { resolve({ error: err || 'Script returned no output' }); }
    });
  });

  if (result.error) {
    return res.status(422).json({ error: result.error, confidence: result.confidence });
  }

  if (!result.match) {
    return res.status(403).json({
      error: `Photo appears to show a ${result.detected} person, but your declared gender is ${declaredGender}. Please use a clear selfie photo.`,
      detected: result.detected,
      confidence: result.confidence
    });
  }

  // Verification passed — update dating_profiles
  await db.query(
    `UPDATE dating_profiles
     SET gender_verified = TRUE, gender_verified_at = NOW(), gender_confidence = $1
     WHERE user_id = $2`,
    [result.confidence, req.user.id]
  );

  res.json({
    ok: true,
    detected: result.detected,
    confidence: result.confidence,
    message: 'Gender verified successfully'
  });
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

// POST /api/users/me/verify — mark user as verified
router.post('/me/verify', requireAuth, async (req, res) => {
  const { gender } = req.body;
  try {
    const { rows } = await db.query(
      'UPDATE users SET is_verified = true WHERE id = $1 RETURNING is_verified',
      [req.user.id]
    );
    if (gender) {
      await db.query(
        `INSERT INTO dating_profiles (user_id, gender) VALUES ($1, $2)
           ON CONFLICT (user_id) DO UPDATE SET gender = $2`,
        [req.user.id, gender]
      );
    }
    res.json(rows[0]);
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
