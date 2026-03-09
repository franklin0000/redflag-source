const router = require('express').Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/searches — user search history
router.get('/', requireAuth, async (req, res) => {
  const { limit = 10 } = req.query;
  try {
    const { rows } = await db.query(
      'SELECT * FROM searches WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
      [req.user.id, limit]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/searches/count — count of searches
router.get('/count', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT COUNT(*) FROM searches WHERE user_id = $1',
      [req.user.id]
    );
    res.json({ count: parseInt(rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/searches — create search record
router.post('/', requireAuth, async (req, res) => {
  const { query, results } = req.body;
  try {
    const { rows } = await db.query(
      'INSERT INTO searches (user_id, query, results) VALUES ($1,$2,$3) RETURNING *',
      [req.user.id, query || null, JSON.stringify(results || [])]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
