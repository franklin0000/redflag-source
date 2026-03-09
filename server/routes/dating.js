const router = require('express').Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/dating/profile — get my dating profile
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM dating_profiles WHERE user_id = $1',
      [req.user.id]
    );
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dating/profile — create or update dating profile
router.post('/profile', requireAuth, async (req, res) => {
  const { bio, age, gender, photos, interests, location, lat, lng } = req.body;
  try {
    const { rows } = await db.query(
      `INSERT INTO dating_profiles (user_id, bio, age, gender, photos, interests, location, lat, lng, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         bio=EXCLUDED.bio, age=EXCLUDED.age, gender=EXCLUDED.gender,
         photos=EXCLUDED.photos, interests=EXCLUDED.interests,
         location=EXCLUDED.location, lat=EXCLUDED.lat, lng=EXCLUDED.lng,
         updated_at=NOW()
       RETURNING *`,
      [req.user.id, bio, age || null, gender || null,
       photos || [], interests || [], location || null, lat || null, lng || null]
    );
    // also update user lat/lng for geo queries
    if (lat && lng) {
      await db.query('UPDATE users SET lat=$1, lng=$2, location=$3 WHERE id=$4',
        [lat, lng, location, req.user.id]);
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dating/matches/potential — get people to swipe on
router.get('/matches/potential', requireAuth, async (req, res) => {
  const { lat, lng, mode } = req.query;
  const userLat = parseFloat(lat) || req.user.lat;
  const userLng = parseFloat(lng) || req.user.lng;
  try {
    let rows;
    if (mode === 'global' || !userLat || !userLng) {
      // Global mode — random users with dating profiles
      const result = await db.query(
        `SELECT u.id, u.name, dp.age, dp.bio, dp.photos, dp.interests,
                dp.safety_score, dp.location, dp.lat, dp.lng, dp.gender,
                NULL::double precision AS distance_km
         FROM dating_profiles dp
         JOIN users u ON u.id = dp.user_id
         WHERE dp.is_active = TRUE AND dp.user_id != $1
           AND dp.user_id NOT IN (
             SELECT swiped_id FROM swipes WHERE swiper_id = $1
           )
         ORDER BY RANDOM() LIMIT 50`,
        [req.user.id]
      );
      rows = result.rows;
    } else {
      // Local mode — by distance
      const result = await db.query(
        'SELECT * FROM get_matches_by_distance($1, $2, $3, $4, $5)',
        [req.user.id, userLat, userLng, 100, 50]
      );
      rows = result.rows;
    }

    // Enrich with compatibility score
    const myInterests = (await db.query(
      'SELECT interests FROM dating_profiles WHERE user_id = $1', [req.user.id]
    )).rows[0]?.interests || [];

    const profiles = rows.map(p => {
      const shared = (p.interests || []).filter(i => myInterests.includes(i));
      const compatibility = myInterests.length
        ? Math.round((shared.length / Math.max(myInterests.length, p.interests?.length || 1)) * 100)
        : 50;
      return {
        ...p,
        sharedInterests: shared,
        compatibility,
        isVerified: false,
        safetyScore: p.safety_score ?? 50,
      };
    });

    res.json(profiles);
  } catch (err) {
    console.error('Potential matches error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dating/swipe — swipe left/right
router.post('/swipe', requireAuth, async (req, res) => {
  const { target_id, direction } = req.body;
  if (!target_id || !direction) return res.status(400).json({ error: 'target_id and direction required' });
  try {
    await db.query(
      `INSERT INTO swipes (swiper_id, swiped_id, direction)
       VALUES ($1, $2, $3) ON CONFLICT (swiper_id, swiped_id) DO NOTHING`,
      [req.user.id, target_id, direction]
    );

    let isMatch = false;
    if (direction === 'right' || direction === 'superlike') {
      // Check if target also liked me
      const mutual = await db.query(
        `SELECT id FROM swipes WHERE swiper_id = $1 AND swiped_id = $2
         AND direction IN ('right','superlike')`,
        [target_id, req.user.id]
      );
      if (mutual.rows.length) {
        // Create match (order IDs so UNIQUE works)
        const [u1, u2] = [req.user.id, target_id].sort();
        await db.query(
          `INSERT INTO matches (user1_id, user2_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [u1, u2]
        );
        isMatch = true;

        // Create notifications for both users
        await db.query(
          `INSERT INTO notifications (user_id, type, title, body, data)
           VALUES ($1,'match','New Match!','You have a new match!', $2),
                  ($3,'match','New Match!','You have a new match!', $4)`,
          [req.user.id, JSON.stringify({ matched_with: target_id }),
           target_id, JSON.stringify({ matched_with: req.user.id })]
        );
      }
    }
    res.json({ isMatch });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dating/matches — get my matches list
router.get('/matches', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT m.id as match_id,
              CASE WHEN m.user1_id = $1 THEN m.user2_id ELSE m.user1_id END as partner_id,
              m.last_message, m.last_message_at, m.created_at
       FROM matches m
       WHERE m.user1_id = $1 OR m.user2_id = $1
       ORDER BY COALESCE(m.last_message_at, m.created_at) DESC`,
      [req.user.id]
    );

    // Enrich with partner info and unread count
    const enriched = await Promise.all(rows.map(async (match) => {
      const partner = await db.query(
        'SELECT id, name, avatar_url FROM users WHERE id = $1',
        [match.partner_id]
      );
      const unread = await db.query(
        `SELECT COUNT(*) FROM messages
         WHERE match_id = $1 AND sender_id != $2 AND is_read = FALSE`,
        [match.match_id, req.user.id]
      );
      return {
        ...match,
        id: match.partner_id,
        name: partner.rows[0]?.name,
        photo: partner.rows[0]?.avatar_url,
        unread: parseInt(unread.rows[0].count),
      };
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dating/messages/:matchId
router.get('/messages/:matchId', requireAuth, async (req, res) => {
  try {
    // Verify user is part of this match
    const match = await db.query(
      'SELECT id FROM matches WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)',
      [req.params.matchId, req.user.id]
    );
    if (!match.rows.length) return res.status(403).json({ error: 'Not your match' });

    const { rows } = await db.query(
      'SELECT * FROM messages WHERE match_id = $1 ORDER BY created_at ASC',
      [req.params.matchId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dating/messages/:matchId — send message (REST fallback)
router.post('/messages/:matchId', requireAuth, async (req, res) => {
  const { content, iv } = req.body;
  if (!content) return res.status(400).json({ error: 'content required' });
  try {
    const match = await db.query(
      'SELECT * FROM matches WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)',
      [req.params.matchId, req.user.id]
    );
    if (!match.rows.length) return res.status(403).json({ error: 'Not your match' });

    const { rows } = await db.query(
      `INSERT INTO messages (match_id, sender_id, content, iv)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.matchId, req.user.id, content, iv || null]
    );

    await db.query(
      `UPDATE matches SET last_message=$1, last_message_at=NOW() WHERE id=$2`,
      [content.substring(0, 100), req.params.matchId]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/dating/messages/:matchId/read — mark as read
router.patch('/messages/:matchId/read', requireAuth, async (req, res) => {
  try {
    await db.query(
      `UPDATE messages SET is_read = TRUE
       WHERE match_id = $1 AND sender_id != $2`,
      [req.params.matchId, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
