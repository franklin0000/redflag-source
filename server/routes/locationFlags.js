const router = require('express').Router();
const db = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');

let _io = null;
router.setIo = (io) => { _io = io; };

// GET /api/location-flags — all flags
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM location_flags ORDER BY created_at DESC LIMIT 500'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/location-flags — create flag
router.post('/', requireAuth, async (req, res) => {
  const { place_id, place_name, lat, lng, flag_type, comment, media } = req.body;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });
  try {
    const { rows } = await db.query(
      `INSERT INTO location_flags (user_id, place_id, place_name, lat, lng, flag_type, comment, media)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.id, place_id, place_name, lat, lng, flag_type || 'red', comment, JSON.stringify(media ?? [])]
    );
    const flag = rows[0];
    if (_io) _io.emit('flag:new', flag);
    res.status(201).json(flag);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/location-flags/:id — delete own flag
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rowCount } = await db.query(
      'DELETE FROM location_flags WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Flag not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
