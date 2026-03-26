const router = require('express').Router();
const db = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');

// GET /api/stats/community — public stats
router.get('/community', optionalAuth, async (req, res) => {
  try {
    const [reports, users] = await Promise.all([
      db.query('SELECT COUNT(*) FROM reports'),
      db.query('SELECT COUNT(*) FROM users'),
    ]);
    res.json({
      totalReports: parseInt(reports.rows[0].count),
      totalUsers: parseInt(users.rows[0].count),
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/stats/dashboard — user dashboard stats
router.get('/dashboard', requireAuth, async (req, res) => {
  const userId = req.user.id;
  try {
    const [scansRow, reportsRow, userRow] = await Promise.all([
      db.query('SELECT COUNT(*) FROM searches WHERE user_id = $1', [userId]),
      db.query('SELECT COUNT(*) FROM reports WHERE reporter_id = $1', [userId]),
      db.query('SELECT created_at, safety_score FROM users WHERE id = $1', [userId]),
    ]);

    const totalScans = parseInt(scansRow.rows[0].count);
    const reportsCount = parseInt(reportsRow.rows[0].count);
    const profile = userRow.rows[0];

    const createdAt = profile?.created_at ? new Date(profile.created_at).getTime() : Date.now();
    const daysProtected = Math.max(1, Math.floor((Date.now() - createdAt) / (1000 * 60 * 60 * 24)));

    let safetyScore = profile?.safety_score || 50;
    safetyScore = Math.min(100, safetyScore + Math.min(15, totalScans * 3) + Math.min(10, reportsCount * 2));

    res.json({ totalScans, reportsCount, daysProtected, safetyScore });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/stats/activity — latest reports for live activity ticker
router.get('/activity', optionalAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, category as type, 'Anonymous' as name, created_at
       FROM reports ORDER BY created_at DESC LIMIT 5`
    );
    res.json(rows.map(r => ({
      id: r.id,
      type: r.type || 'report',
      name: r.name,
      location: '',
      severity: 'review',
      timestamp: r.created_at,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
