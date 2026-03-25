const router = require('express').Router();
const db = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');

// GET /api/reports — public reports feed
router.get('/', optionalAuth, async (req, res) => {
  const { limit = 20, offset = 0, category } = req.query;
  try {
    const params = [limit, offset];
    let where = category ? `WHERE r.category = $3` : '';
    if (category) params.push(category);
    const { rows } = await db.query(
      `SELECT r.id, r.reported_name, r.platform, r.description, r.category,
              r.evidence_urls, r.upvotes, r.created_at
       FROM reports r
       ${where}
       ORDER BY r.created_at DESC LIMIT $1 OFFSET $2`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reports — create report
router.post('/', requireAuth, async (req, res) => {
  const { reported_name, platform, description, category, evidence_urls } = req.body;
  if (!reported_name) return res.status(400).json({ error: 'reported_name required' });
  try {
    const { rows } = await db.query(
      `INSERT INTO reports (reporter_id, reported_name, platform, description, category, evidence_urls)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.id, reported_name, platform, description, category, evidence_urls || []]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reports/:id/evidence — upload evidence photo
router.post('/:id/evidence', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.fileUrl) return res.status(400).json({ error: 'Upload failed' });
    const { rows } = await db.query(
      `UPDATE reports SET evidence_urls = array_append(evidence_urls, $1)
       WHERE id = $2 AND reporter_id = $3 RETURNING evidence_urls`,
      [req.fileUrl, req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Report not found' });
    res.json({ evidence_urls: rows[0].evidence_urls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reports/:id/upvote
router.post('/:id/upvote', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'UPDATE reports SET upvotes = upvotes + 1 WHERE id = $1 RETURNING upvotes',
      [req.params.id]
    );
    res.json({ upvotes: rows[0]?.upvotes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/me — my reports
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM reports WHERE reporter_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/count
router.get('/count', optionalAuth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT COUNT(*) FROM reports');
    res.json({ count: parseInt(rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/:id — single report
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT r.id, r.reported_name, r.platform, r.description, r.category,
              r.evidence_urls, r.upvotes, r.created_at
       FROM reports r
       WHERE r.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Report not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Comments on reports ───────────────────────────────────────

// GET /api/reports/:id/comments
router.get('/:id/comments', optionalAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT c.id, c.report_id, c.content, c.upvotes, c.created_at
       FROM comments c
       WHERE c.report_id = $1
       ORDER BY c.created_at ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reports/:id/comments
router.post('/:id/comments', requireAuth, async (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'content required' });
  try {
    const { rows } = await db.query(
      `INSERT INTO comments (user_id, report_id, content)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.user.id, req.params.id, content.trim()]
    );
    const comment = { ...rows[0] };
    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reports/:id/comments/:commentId/upvote
router.post('/:id/comments/:commentId/upvote', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'UPDATE comments SET upvotes = upvotes + 1 WHERE id = $1 AND report_id = $2 RETURNING upvotes',
      [req.params.commentId, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Comment not found' });
    res.json({ upvotes: rows[0].upvotes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
