const router = require('express').Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { encryptMessage, decryptMessage } = require('../services/e2ee');

// ── Helper: resolve composite "uuid_uuid" matchId to actual match UUID ──────
// DatingChat constructs matchId as [user.id, partnerId].sort().join('_').
// This helper accepts both real UUIDs and composite keys.
// DatingChat constructs matchId as [user.id, partnerId].sort().join('_').
// This helper accepts both real UUIDs and composite keys.
async function resolveMatchId(rawId, userId = null) {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (UUID_RE.test(rawId)) {
    // 1. Is it already a valid match ID?
    const { rows } = await db.query('SELECT id FROM matches WHERE id = $1', [rawId]);
    if (rows.length) return rawId;

    // 2. Is it a partner ID? If so, find the match between this user and that partner.
    if (userId) {
      const matchByPartner = await db.query(
        'SELECT id FROM matches WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)',
        [userId, rawId]
      );
      if (matchByPartner.rows.length) return matchByPartner.rows[0].id;
    }
  }

  const parts = rawId.split('_');
  if (parts.length === 2 && UUID_RE.test(parts[0]) && UUID_RE.test(parts[1])) {
    const { rows } = await db.query(
      'SELECT id FROM matches WHERE (user1_id=$1 AND user2_id=$2) OR (user1_id=$2 AND user2_id=$1)',
      [parts[0], parts[1]]
    );
    if (rows.length) return rows[0].id;
  }
  return null; // not resolvable
}

// GET /api/dating/profile/:userId — view another user's dating profile + safety info
router.get('/profile/:userId', requireAuth, async (req, res) => {
  const { userId } = req.params;
  try {
    // LEFT JOIN so basic user info always returns even without a dating profile
    const { rows } = await db.query(
      `SELECT u.id, u.name, u.photo_url, u.is_verified,
              dp.age, dp.bio, dp.photos, dp.interests, dp.safety_score,
              dp.location, dp.gender, dp.gender_verified
       FROM users u
       LEFT JOIN dating_profiles dp ON dp.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const profile = rows[0];

    // Reports filed against them (red flag count)
    const { rows: repRows } = await db.query(
      'SELECT COUNT(*) FROM reports WHERE reported_id = $1',
      [userId]
    );
    const reportCount = parseInt(repRows[0].count) || 0;

    // Compatibility with the viewer
    const myInterests = (await db.query(
      'SELECT interests FROM dating_profiles WHERE user_id = $1', [req.user.id]
    )).rows[0]?.interests || [];
    const shared = (profile.interests || []).filter(i => myInterests.includes(i));
    const compatibility = myInterests.length
      ? Math.round((shared.length / Math.max(myInterests.length, profile.interests?.length || 1)) * 100)
      : 50;

    res.json({ ...profile, reportCount, sharedInterests: shared, compatibility });
  } catch (err) {
    console.error('profile/:userId error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/dating/profile — get my dating profile
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM dating_profiles WHERE user_id = $1',
      [req.user.id]
    );
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
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
    res.status(500).json({ error: 'Internal server error' });
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
    res.status(500).json({ error: 'Internal server error' });
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
           VALUES ($1, $2) ON CONFLICT (user1_id, user2_id) DO NOTHING`,
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
    res.status(500).json({ error: 'Internal server error' });
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
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/dating/messages/:matchId
router.get('/messages/:matchId', requireAuth, async (req, res) => {
  try {
    const matchId = await resolveMatchId(req.params.matchId, req.user.id);
    if (!matchId) return res.status(404).json({ error: 'Match not found' });
    const match = await db.query(
      'SELECT id FROM matches WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)',
      [matchId, req.user.id]
    );
    if (!match.rows.length) return res.status(403).json({ error: 'Not your match' });

    const { rows } = await db.query(
      `SELECT * FROM messages WHERE match_id = $1
       AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at ASC`,
      [matchId]
    );

    // ── DIO-LEVEL ARCHITECTURE: DECRYPT SIGNAL PAYLOADS ─────────
    const decryptedRows = await Promise.all(rows.map(async msg => {
      try {
        const partnerId = msg.sender_id === req.user.id ? req.user.id : msg.sender_id;
        msg.content = await decryptMessage(req.user.id, partnerId, { body: msg.content });
      } catch (err) {
        msg.content = '[Encrypted Message - Unreadable]';
      }
      return msg;
    }));

    res.json(decryptedRows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/dating/messages/:matchId — send message (REST fallback)
router.post('/messages/:matchId', requireAuth, async (req, res) => {
  const { content, iv } = req.body;
  if (!content) return res.status(400).json({ error: 'content required' });
  try {
    const matchId = await resolveMatchId(req.params.matchId, req.user.id);
    if (!matchId) return res.status(404).json({ error: 'Match not found' });
    const match = await db.query(
      'SELECT * FROM matches WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)',
      [matchId, req.user.id]
    );
    if (!match.rows.length) return res.status(403).json({ error: 'Not your match' });

    const matchRow = match.rows[0];
    const partnerId = matchRow.user1_id === req.user.id ? matchRow.user2_id : matchRow.user1_id;

    // ── DIO-LEVEL ARCHITECTURE: ENCRYPT SIGNAL PAYLOADS ─────────
    const e2ePayload = await encryptMessage(req.user.id, partnerId, content);

    const { rows } = await db.query(
      `INSERT INTO messages (match_id, sender_id, content, iv)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [matchId, req.user.id, e2ePayload.body, iv || null]
    );
    let message = rows[0];

    await db.query(
      `UPDATE matches SET last_message=$1, last_message_at=NOW() WHERE id=$2`,
      ['[Encrypted Message]', matchId]
    );

    // Broadcast to Socket.io so recipients see it in real-time
    const { getIO } = require('../ioRef');
    
    // Decrypt the ephemeral emit payload for the active socket session so clients can read it
    message.content = content; 

    getIO()?.to(`match:${matchId}`).emit('new_message', { ...message, match_id: matchId, room_id: req.params.matchId });

    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/dating/messages/:matchId/read — mark as read
router.patch('/messages/:matchId/read', requireAuth, async (req, res) => {
  try {
    const matchId = await resolveMatchId(req.params.matchId, req.user.id);
    if (!matchId) return res.status(404).json({ error: 'Match not found' });
    await db.query(
      `UPDATE messages SET is_read = TRUE
       WHERE match_id = $1 AND sender_id != $2`,
      [matchId, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/dating/messages/:matchId/all — clear chat history
router.delete('/messages/:matchId/all', requireAuth, async (req, res) => {
  try {
    const matchId = await resolveMatchId(req.params.matchId, req.user.id);
    if (!matchId) return res.status(404).json({ error: 'Match not found' });
    const { rows } = await db.query(
      'SELECT id FROM matches WHERE id=$1 AND (user1_id=$2 OR user2_id=$2)',
      [matchId, req.user.id]
    );
    if (!rows.length) return res.status(403).json({ error: 'Not authorized' });
    await db.query('DELETE FROM messages WHERE match_id = $1', [matchId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/dating/match-with/:partnerId — resolve the real match UUID for a partner
// Used by DatePlanner to get the actual match record UUID before sending messages.
router.get('/match-with/:partnerId', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT m.id FROM matches m
       WHERE (m.user1_id=$1 AND m.user2_id=$2) OR (m.user1_id=$2 AND m.user2_id=$1)`,
      [req.user.id, req.params.partnerId]
    );
    if (!rows.length) return res.status(404).json({ error: 'No match found' });
    res.json({ match_id: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/dating/dm/initiate/:partnerId — find or create a private DM match
// Used by CommunityHub to open a private chat with any user.
router.post('/dm/initiate/:partnerId', requireAuth, async (req, res) => {
  const { partnerId } = req.params;
  const userId = req.user.id;

  if (partnerId === userId) return res.status(400).json({ error: 'Cannot DM yourself' });

  try {
    // Verify partner exists
    const { rows: partner } = await db.query('SELECT id FROM users WHERE id = $1', [partnerId]);
    if (!partner.length) return res.status(404).json({ error: 'User not found' });

    // Find existing match
    const { rows: existing } = await db.query(
      'SELECT id FROM matches WHERE (user1_id=$1 AND user2_id=$2) OR (user1_id=$2 AND user2_id=$1)',
      [userId, partnerId]
    );
    if (existing.length) return res.json({ matchId: existing[0].id, partnerId });

    // Create new DM (order user IDs for consistent UNIQUE constraint)
    const [u1, u2] = [userId, partnerId].sort();
    const { rows: created } = await db.query(
      'INSERT INTO matches (user1_id, user2_id) VALUES ($1, $2) ON CONFLICT (user1_id, user2_id) DO UPDATE SET created_at = matches.created_at RETURNING id',
      [u1, u2]
    );
    res.json({ matchId: created[0].id, partnerId });
  } catch (err) {
    console.error('DM initiate error:', err);
    res.status(500).json({ error: 'Failed to initiate DM' });
  }
});

module.exports = router;
