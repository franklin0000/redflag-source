const router = require('express').Router();
const db = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { getIO } = require('../ioRef');

// ── Gender Room Access Control ────────────────────────────────────────────────
// 'women' room → female only | 'men' room → male only | others → open
const ROOM_GENDER = { women: 'female', men: 'male' };

function normalizeGender(g) {
  if (!g) return '';
  const lower = String(g).toLowerCase().trim();
  if (lower === 'mujer') return 'female';
  if (lower === 'hombre') return 'male';
  return lower;
}

// Returns error message string if access is denied, null if allowed
function roomAccessDenied(user, roomId) {
  const required = ROOM_GENDER[roomId];
  if (!required) return null; // no restriction (mixed/general)
  if (!user) return 'Login required to access this room';
  const g = normalizeGender(user.gender);
  if (!g) return 'gender_not_set';
  if (g !== required) {
    const label = required === 'female' ? 'women' : 'men';
    return `This room is for ${label} only`;
  }
  if (!user.gender_verified) return 'gender_not_verified';
  return null;
}

// GET /api/posts — community feed (optional user_id and room_id filter)
router.get('/', optionalAuth, async (req, res) => {
  const { limit = 20, offset = 0, user_id, room_id } = req.query;

  // Gender-restricted room: deny access if gender doesn't match
  const denied = roomAccessDenied(req.user, room_id);
  if (denied) return res.status(403).json({ error: denied });

  try {
    const params = [parseInt(limit), parseInt(offset)];
    const conditions = [];
    if (user_id) { params.push(user_id); conditions.push(`p.user_id = $${params.length}`); }
    if (room_id) { params.push(room_id); conditions.push(`p.room_id = $${params.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
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
  const { content, media_url, media_type, media_name, room_id = 'general' } = req.body;
  if (!content) return res.status(400).json({ error: 'content required' });

  const denied = roomAccessDenied(req.user, room_id);
  if (denied) return res.status(403).json({ error: denied });

  try {
    const { rows } = await db.query(
      `INSERT INTO posts (user_id, content, media_url, media_type, media_name, room_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *, $7::text as name, $8::text as avatar_url`,
      [req.user.id, content, media_url || null, media_type || null, media_name || null, room_id,
       req.user.name, req.user.avatar_url || null]
    );
    const post = rows[0];
    res.status(201).json(post);
    // Broadcast to community room in real-time
    getIO()?.to(`community:${room_id}`).emit('new_community_post', post);
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
    // Check room access before allowing reaction
    const { rows: postRows } = await db.query('SELECT room_id FROM posts WHERE id = $1', [req.params.id]);
    if (postRows.length) {
      const denied = roomAccessDenied(req.user, postRows[0].room_id);
      if (denied) return res.status(403).json({ error: denied });
    }
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
    // Check room access before allowing reply
    const { rows: postRows } = await db.query('SELECT room_id FROM posts WHERE id = $1', [req.params.id]);
    if (postRows.length) {
      const denied = roomAccessDenied(req.user, postRows[0].room_id);
      if (denied) return res.status(403).json({ error: denied });
    }
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
