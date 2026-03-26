const router = require('express').Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/emojis — get user's custom emojis
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM custom_emojis WHERE user_id=$1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/emojis — save custom emoji
router.post('/', requireAuth, async (req, res) => {
  const { name, layers, svg_content } = req.body;
  if (!name || !layers) return res.status(400).json({ error: 'name and layers required' });
  try {
    const { rows } = await db.query(
      `INSERT INTO custom_emojis (user_id, name, layers, svg_content)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user.id, name, JSON.stringify(layers), svg_content || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/emojis/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await db.query(
      'DELETE FROM custom_emojis WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
