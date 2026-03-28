const router = require('express').Router();
const crypto = require('crypto');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const sosLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,  // 5 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many SOS requests, please try again later' },
});

let _io = null;
router.setIo = (io) => { _io = io; };

// POST /api/guardian/sessions — create session
router.post('/sessions', requireAuth, async (req, res) => {
  const { dater_name, date_location, contacts } = req.body;
  const token = crypto.randomBytes(32).toString('hex');
  const notes = [dater_name && `Name: ${dater_name}`, date_location && `Location: ${date_location}`]
    .filter(Boolean).join(' | ') || null;
  try {
    const { rows } = await db.query(
      `INSERT INTO guardian_sessions (user_id, token, status, notes, contacts)
       VALUES ($1,$2,'active',$3,$4) RETURNING *`,
      [req.user.id, token, notes, JSON.stringify(contacts || [])]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[guardian] create session:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/guardian/sessions/mine — get active session for current user
router.get('/sessions/mine', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM guardian_sessions
       WHERE user_id=$1 AND status='active'
       ORDER BY created_at DESC LIMIT 1`,
      [req.user.id]
    );
    res.json(rows[0] || null);
  } catch (err) {
    console.error('[guardian] get mine:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/guardian/sessions/:id — get own session by ID
router.get('/sessions/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM guardian_sessions WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Session not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[guardian] get session:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/guardian/view/:token — public guardian view (no auth required)
router.get('/view/:token', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, token, notes, status, lat, lng, location, contacts, created_at
       FROM guardian_sessions WHERE token=$1 AND status='active'`,
      [req.params.token]
    );
    if (!rows.length) return res.status(404).json({ error: 'Session expired or not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[guardian] view:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PREDICTIVE GEOFENCING ────────────────────────────────────────
function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const p1 = lat1 * Math.PI/180, p2 = lat2 * Math.PI/180;
  const dp = (lat2-lat1) * Math.PI/180, dl = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(dp/2) * Math.sin(dp/2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2) * Math.sin(dl/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// PATCH /api/guardian/sessions/:id/location — update GPS with Geofencing
router.patch('/sessions/:id/location', requireAuth, async (req, res) => {
  const lat = parseFloat(req.body.lat);
  const lng = parseFloat(req.body.lng);
  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ error: 'Valid lat (-90 to 90) and lng (-180 to 180) are required' });
  }

  try {
    // Fetch current session for geofence analysis
    const { rows: current } = await db.query(
      'SELECT lat, lng, token FROM guardian_sessions WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!current.length) return res.status(404).json({ error: 'Session not found' });

    let triggerAutoSos = false;
    const prev = current[0];

    if (prev.lat != null && prev.lng != null) {
      const dist = getDistanceMeters(lat, lng, prev.lat, prev.lng);
      if (dist > 200) {
        triggerAutoSos = true;
        console.warn(`[Guardian] Geofence alert: user deviated ${Math.round(dist)}m suddenly.`);
      }
    }

    const { rows } = await db.query(
      `UPDATE guardian_sessions
       SET lat=$1, lng=$2, location=$3
       WHERE id=$4 AND user_id=$5 RETURNING *`,
      [lat, lng, JSON.stringify({ lat, lng, updatedAt: new Date().toISOString() }), req.params.id, req.user.id]
    );

    if (triggerAutoSos) {
      // Log SOS alert
      await db.query(
        'INSERT INTO sos_alerts (user_id, lat, lng, message) VALUES ($1,$2,$3,$4)',
        [req.user.id, lat, lng, 'Auto SOS: Geofence deviation > 200m']
      );
    }

    if (_io) {
      _io.to(`guardian:${rows[0].token}`).emit('guardian:location', { lat, lng, alert: triggerAutoSos });
      if (triggerAutoSos) {
        _io.to(`guardian:${rows[0].token}`).emit('guardian:sos', { session: rows[0], reason: 'Geofence Deviation > 200m' });
      }
    }

    res.json({ ok: true, autoSosTriggered: triggerAutoSos });
  } catch (err) {
    console.error('[guardian] location update:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/guardian/sessions/:id/checkin — mark safe
router.post('/sessions/:id/checkin', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE guardian_sessions SET status='active'
       WHERE id=$1 AND user_id=$2 AND status='active' RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Session not found' });
    if (_io) _io.to(`guardian:${rows[0].token}`).emit('guardian:update', rows[0]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[guardian] checkin:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/guardian/sessions/:id/sos — trigger SOS
router.post('/sessions/:id/sos', sosLimiter, requireAuth, async (req, res) => {
  const { location } = req.body;
  const lat = location?.lat ? parseFloat(location.lat) : null;
  const lng = location?.lng ? parseFloat(location.lng) : null;
  try {
    const { rows } = await db.query(
      'SELECT token FROM guardian_sessions WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Session not found' });

    // Log SOS alert
    await db.query(
      'INSERT INTO sos_alerts (user_id, lat, lng, message) VALUES ($1,$2,$3,$4)',
      [req.user.id, lat, lng, 'Manual SOS triggered']
    );

    if (_io) _io.to(`guardian:${rows[0].token}`).emit('guardian:sos', { sessionId: req.params.id, location });
    res.json({ ok: true });
  } catch (err) {
    console.error('[guardian] SOS:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/guardian/sessions/:id/sos/cancel
router.post('/sessions/:id/sos/cancel', requireAuth, async (req, res) => {
  try {
    // Mark any active sos_alerts as resolved
    await db.query(
      `UPDATE sos_alerts SET status='resolved'
       WHERE user_id=$1 AND status='active'`,
      [req.user.id]
    );
    const { rows } = await db.query(
      'SELECT token FROM guardian_sessions WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Session not found' });
    if (_io) _io.to(`guardian:${rows[0].token}`).emit('guardian:update', { id: req.params.id, sos: false });
    res.json({ ok: true });
  } catch (err) {
    console.error('[guardian] SOS cancel:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/guardian/sessions/:id/end
router.post('/sessions/:id/end', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE guardian_sessions SET status='ended', ended_at=NOW()
       WHERE id=$1 AND user_id=$2 RETURNING token`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Session not found' });
    if (_io) _io.to(`guardian:${rows[0].token}`).emit('guardian:ended');
    res.json({ ok: true });
  } catch (err) {
    console.error('[guardian] end session:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
