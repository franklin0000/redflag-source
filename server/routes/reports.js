const router = require('express').Router();
const db = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');
const argon2 = require('argon2');
const crypto = require('crypto');

// ── DIO-LEVEL ARCHITECTURE: SECURITY CORE ─────────────────────────
// Generates an irreversible, blinded hash ensuring no correlation
// between reports from the same author is possible.
async function generateBlindedHash(userId) {
  const salt = crypto.randomBytes(32);
  const pepper = process.env.PEPPER || 'default_secure_pepper_3e8f';
  const reporterHash = await argon2.hash(userId + pepper, {
    type: argon2.argon2id,
    salt,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 1,
  });
  return reporterHash;
}

// GET /api/reports — public reports feed
router.get('/', optionalAuth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);
  const { category } = req.query;
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
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/reports — create report (Zero-Knowledge Identity)
router.post('/', requireAuth, async (req, res) => {
  const { reported_name, platform, description, category, evidence_urls } = req.body;
  if (!reported_name) return res.status(400).json({ error: 'reported_name required' });
  
  try {
    const reporterHash = await generateBlindedHash(req.user.id);

    // We generate an ephemeral edit_token so the client can upload evidence
    // right after creation without ever reading the DB or linking the user session.
    const editToken = crypto.randomBytes(16).toString('hex');

    const { rows } = await db.query(
      `INSERT INTO reports (reporter_hash, reported_name, platform, description, category, evidence_urls, edit_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, reported_name, platform, description, category, evidence_urls, created_at, edit_token`,
      [reporterHash, reported_name, platform, description, category, evidence_urls || [], editToken]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[DIO Security] Hash/Report generation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/reports/:id/evidence — upload evidence photo (Uses ephemeral token)
router.post('/:id/evidence', upload.single('file'), async (req, res) => {
  // Ephemeral logic: requireAuth NOT used here to prevent session tracking.
  // Instead, the client must pass the 'edit_token' returned during creation.
  const editToken = req.headers['x-edit-token'] || req.body.editToken;
  if (!editToken || !req.fileUrl) return res.status(400).json({ error: 'Upload failed or missing edit token' });

  try {
    const { rows } = await db.query(
      `UPDATE reports SET evidence_urls = array_append(evidence_urls, $1)
       WHERE id = $2 AND edit_token = $3 RETURNING evidence_urls`,
      [req.fileUrl, req.params.id, editToken]
    );
    if (!rows.length) return res.status(403).json({ error: 'Unauthorized or report not found' });
    res.json({ evidence_urls: rows[0].evidence_urls });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/reports/:id/upvote
router.post('/:id/upvote', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'UPDATE reports SET upvotes = upvotes + 1 WHERE id = $1 RETURNING upvotes',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Report not found' });
    res.json({ upvotes: rows[0].upvotes });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/reports/me — my reports 
// (Disabled at database level for anti-correlation. Returns 403 to prevent scraping)
router.get('/me', requireAuth, async (_req, res) => {
  res.status(403).json({
    error: 'Blind Security Protocol Active', 
    message: 'To ensure zero-correlation anonymity, reports are decoupled from user identities. This endpoint is disabled in DIO architecture.' 
  });
});

// GET /api/reports/count
router.get('/count', optionalAuth, async (_req, res) => {
  try {
    const { rows } = await db.query('SELECT COUNT(*) FROM reports');
    res.json({ count: parseInt(rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
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
    res.status(500).json({ error: 'Internal server error' });
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
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/reports/:id/comments
router.post('/:id/comments', requireAuth, async (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'content required' });
  try {
    const reporterHash = await generateBlindedHash(req.user.id);
    const { rows } = await db.query(
      `INSERT INTO comments (reporter_hash, report_id, content)
       VALUES ($1, $2, $3) RETURNING id, report_id, content, upvotes, created_at`,
      [reporterHash, req.params.id, content.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
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
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

