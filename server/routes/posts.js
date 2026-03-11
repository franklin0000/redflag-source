const router = require('express').Router();
const db = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');

// GET /api/posts — community feed (optional user_id filter)
router.get('/', optionalAuth, async (req, res) => {
  const { limit = 20, offset = 0, user_id } = req.query;
  try {
    const params = [limit, offset];
    const where = user_id ? 'WHERE p.user_id = $3' : '';
    if (user_id) params.push(user_id);
    const { rows } = await db.query(
      `SELECT p.*, u.name, u.avatar_url, u.is_verified
       FROM posts p JOIN users u ON u.id = p.user_id
       ${where}
       ORDER BY p.created_at DESC
       LIMIT $1 OFFSET $2`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/posts — create post
router.post('/', requireAuth, async (req, res) => {
  const { content, media_url } = req.body;
  if (!content) return res.status(400).json({ error: 'content required' });
  try {
    const { rows } = await db.query(
      `INSERT INTO posts (user_id, content, media_url)
       VALUES ($1,$2,$3) RETURNING *`,
      [req.user.id, content, media_url || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/posts/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rowCount } = await db.query(
      'DELETE FROM posts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found or not yours' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/posts/:id/react — add emoji reaction
router.post('/:id/react', requireAuth, async (req, res) => {
  const { emoji } = req.body;
  const allowed = ['❤️','🚩','👀','🤮','😂','💪'];
  if (!allowed.includes(emoji)) return res.status(400).json({ error: 'Invalid emoji' });
  try {
    const { rows } = await db.query(
      `UPDATE posts
       SET reactions = jsonb_set(
         reactions,
         ARRAY[$1],
         (COALESCE((reactions->$1)::int, 0) + 1)::text::jsonb
       )
       WHERE id = $2 RETURNING reactions`,
      [emoji, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Post not found' });
    res.json({ reactions: rows[0].reactions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/posts/:id/reply — add reply
router.post('/:id/reply', requireAuth, async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'content required' });
  try {
    const reply = {
      id: require('uuid').v4(),
      user_id: req.user.id,
      name: req.user.name,
      avatar_url: req.user.avatar_url,
      content,
      created_at: new Date().toISOString(),
    };
    const { rows } = await db.query(
      `UPDATE posts SET replies = replies || $1::jsonb WHERE id = $2 RETURNING replies`,
      [JSON.stringify([reply]), req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Post not found' });
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Comments on posts ─────────────────────────────────────────

// GET /api/posts/:id/comments
router.get('/:id/comments', optionalAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT c.*, u.name as user_name, u.avatar_url as user_avatar
       FROM comments c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.post_id = $1
       ORDER BY c.created_at ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/posts/:id/comments
router.post('/:id/comments', requireAuth, async (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'content required' });
  try {
    const { rows } = await db.query(
      `INSERT INTO comments (user_id, post_id, content)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.user.id, req.params.id, content.trim()]
    );
    const comment = { ...rows[0], user_name: req.user.name, user_avatar: req.user.avatar_url };
    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
