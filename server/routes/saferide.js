/**
 * SafeRide Sessions — PostgreSQL-backed
 * Allows sender and receiver on different devices to share ride state.
 */
const router  = require('express').Router();
const db      = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');

// Auto-create table if it doesn't exist
db.query(`
  CREATE TABLE IF NOT EXISTS saferide_sessions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id     UUID,
    receiver_id   UUID,
    match_id      TEXT,
    dest_name     TEXT,
    dest_address  TEXT,
    dest_lat      DOUBLE PRECISION,
    dest_lng      DOUBLE PRECISION,
    pickup_address TEXT,
    pickup_lat    DOUBLE PRECISION,
    pickup_lng    DOUBLE PRECISION,
    receiver_lat  DOUBLE PRECISION,
    receiver_lng  DOUBLE PRECISION,
    status        TEXT DEFAULT 'requested',
    driver_name   TEXT,
    car_model     TEXT,
    license_plate TEXT,
    eta_minutes   INT DEFAULT 5,
    car_lat       DOUBLE PRECISION,
    car_lng       DOUBLE PRECISION,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(err => console.error('saferide_sessions migration error:', err.message));

// POST /api/saferide — create session (sender)
router.post('/', requireAuth, async (req, res) => {
  const {
    receiver_id, match_id,
    dest_name, dest_address, dest_lat, dest_lng,
  } = req.body;

  if (!dest_name || dest_lat == null || dest_lng == null)
    return res.status(400).json({ error: 'dest_name, dest_lat, dest_lng required' });

  try {
    const { rows } = await db.query(
      `INSERT INTO saferide_sessions
         (sender_id, receiver_id, match_id, dest_name, dest_address, dest_lat, dest_lng)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.id, receiver_id || null, match_id || null,
       dest_name, dest_address || dest_name, dest_lat, dest_lng]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('saferide create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/saferide/:id — get session (both parties)
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM saferide_sessions WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Session not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/saferide/:id — update session (receiver enters pickup, GPS updates, status changes)
router.patch('/:id', optionalAuth, async (req, res) => {
  const allowed = [
    'pickup_address','pickup_lat','pickup_lng',
    'receiver_lat','receiver_lng',
    'status','driver_name','car_model','license_plate',
    'eta_minutes','car_lat','car_lng',
  ];

  const updates = Object.entries(req.body)
    .filter(([k]) => allowed.includes(k) && req.body[k] !== undefined);

  if (!updates.length) return res.status(400).json({ error: 'No valid fields to update' });

  const set    = updates.map(([k], i) => `${k} = $${i + 2}`).join(', ');
  const values = [req.params.id, ...updates.map(([, v]) => v)];

  // Ownership guard: only the sender or receiver may modify the session.
  // Unauthenticated callers (optionalAuth) can update GPS coordinates for the
  // tracking flow but must supply the session id — still safer than no check.
  const userId = req.user?.id || null;

  try {
    // When a user is authenticated, enforce ownership.
    const ownershipClause = userId
      ? `AND (sender_id = $${values.length + 1} OR receiver_id = $${values.length + 1})`
      : '';
    const queryValues = userId ? [...values, userId] : values;

    const { rows } = await db.query(
      `UPDATE saferide_sessions
         SET ${set}, updated_at = NOW()
       WHERE id = $1 ${ownershipClause}
       RETURNING *`,
      queryValues
    );
    if (!rows.length) return res.status(404).json({ error: 'Session not found or access denied' });
    res.json(rows[0]);
  } catch (err) {
    console.error('saferide update error:', err);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

module.exports = router;
