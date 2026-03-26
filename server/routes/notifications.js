const router = require('express').Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const webpush = require('web-push');

// VAPID keys for push notifications
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        'mailto:support@redflag.app',
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY
    );
}

// Store push subscriptions
const pushSubscriptions = new Map(); // userId -> subscription

// GET /api/notifications
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM notifications WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/notifications/read-all
router.patch('/read-all', requireAuth, async (req, res) => {
  try {
    await db.query('UPDATE notifications SET is_read=TRUE WHERE user_id=$1', [req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/notifications/unread-count
router.get('/unread-count', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id=$1 AND is_read=FALSE',
      [req.user.id]
    );
    res.json({ count: parseInt(rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/notifications/vapid-key - returns VAPID public key for client
router.get('/vapid-key', (_req, res) => {
  res.json({ key: VAPID_PUBLIC_KEY });
});

// POST /api/notifications/subscribe - save push subscription
router.post('/subscribe', requireAuth, async (req, res) => {
  try {
    const subscription = req.body;
    pushSubscriptions.set(req.user.id, subscription);
    
    // Also save to DB
    await db.query(
      `INSERT INTO push_subscriptions (user_id, subscription) 
       VALUES ($1, $2) 
       ON CONFLICT (user_id) DO UPDATE SET subscription = $2`,
      [req.user.id, JSON.stringify(subscription)]
    );
    
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/notifications/unsubscribe - remove push subscription
router.post('/unsubscribe', requireAuth, async (req, res) => {
  try {
    pushSubscriptions.delete(req.user.id);
    await db.query('DELETE FROM push_subscriptions WHERE user_id = $1', [req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/notifications/send - send push notification to yourself only
router.post('/send', requireAuth, async (req, res) => {
  const userId = req.user.id; // always use the authenticated user's own id
  const { title, body, data } = req.body;

  try {
    let sub = pushSubscriptions.get(userId);
    if (!sub) {
      const { rows } = await db.query(
        'SELECT subscription FROM push_subscriptions WHERE user_id = $1',
        [userId]
      );
      if (rows.length === 0) return res.json({ sent: false, reason: 'no subscription' });
      sub = JSON.parse(rows[0].subscription);
    }

    await webpush.sendNotification(sub, JSON.stringify({
      title,
      body,
      data,
      icon: '/icons/icon-192.png',
    }));

    res.json({ sent: true });
  } catch (err) {
    if (err.statusCode === 410) {
      pushSubscriptions.delete(userId);
      await db.query('DELETE FROM push_subscriptions WHERE user_id = $1', [userId]);
    }
    res.json({ sent: false });
  }
});

// Helper: Send notification to user (call from other routes)
module.exports.sendPush = async (userId, title, body, data = {}) => {
  try {
    const { rows } = await db.query(
      'SELECT subscription FROM push_subscriptions WHERE user_id = $1',
      [userId]
    );
    if (rows.length === 0) return false;
    
    const subscription = JSON.parse(rows[0].subscription);
    await webpush.sendNotification(subscription, JSON.stringify({
      title,
      body,
      data,
      icon: '/icons/icon-192.png',
    }));
    return true;
  } catch (err) {
    if (err.statusCode === 410) {
      await db.query('DELETE FROM push_subscriptions WHERE user_id = $1', [userId]);
    }
    console.warn('Push notification failed:', err.message);
    return false;
  }
};

module.exports = router;
