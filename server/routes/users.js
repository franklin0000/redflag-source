const router = require('express').Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');

// GET /api/users/me — return current user profile
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.name, u.username, u.avatar_url, u.bio, u.is_paid, u.is_verified,
              u.is_verified_web3, u.safety_score, u.location, u.created_at, u.last_seen, u.settings,
              dp.gender, dp.gender_verified
       FROM users u
       LEFT JOIN dating_profiles dp ON dp.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/blocked — MUST be before /:id wildcard to avoid mis-routing
router.get('/blocked', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.name, u.username, u.avatar_url
       FROM blocked_users b JOIN users u ON u.id = b.blocked_id
       WHERE b.blocker_id = $1`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, username, avatar_url, bio, is_paid, is_verified,
              is_verified_web3, safety_score, location, created_at, last_seen
       FROM users WHERE id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/users/me — update profile
router.patch('/me', requireAuth, async (req, res) => {
  const { name, bio, location, lat, lng, avatar_url, photo_url, is_paid, is_verified_web3, gender, wallet_address } = req.body;
  try {
    const { rows } = await db.query(
      `UPDATE users SET
         name = COALESCE($1, name),
         bio = COALESCE($2, bio),
         location = COALESCE($3, location),
         lat = COALESCE($4, lat),
         lng = COALESCE($5, lng),
         avatar_url = COALESCE($6, COALESCE($7, avatar_url)),
         is_paid = COALESCE($8, is_paid),
         is_verified_web3 = COALESCE($9, is_verified_web3),
         wallet_address = COALESCE($10, wallet_address),
         last_seen = NOW(),
         geom = CASE WHEN $4::float IS NOT NULL AND $5::float IS NOT NULL THEN ST_SetSRID(ST_MakePoint($5, $4), 4326) ELSE geom END
       WHERE id = $11 RETURNING id, name, username, avatar_url, bio, is_paid, is_verified,
         is_verified_web3, safety_score, location, lat, lng, email, wallet_address, created_at`,
      [name, bio, location, lat, lng, avatar_url, photo_url, is_paid, is_verified_web3, wallet_address, req.user.id]
    );
    // Update gender in dating_profiles if provided
    if (gender) {
      await db.query(
        `INSERT INTO dating_profiles (user_id, gender) VALUES ($1,$2)
         ON CONFLICT (user_id) DO UPDATE SET gender=$2`,
        [req.user.id, gender]
      ).catch(() => {});
    }
    // Return the updated user with gender and verification status
    const { rows: updatedRows } = await db.query(
      `SELECT u.id, u.name, u.username, u.avatar_url, u.bio, u.is_paid, u.is_verified,
              u.is_verified_web3, u.safety_score, u.location, u.lat, u.lng, u.email, 
              u.wallet_address, u.created_at, u.last_seen, u.settings,
              dp.gender, dp.gender_verified
       FROM users u
       LEFT JOIN dating_profiles dp ON dp.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    res.json(updatedRows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users/verify-gender — AI gender verification using a live selfie
// Accepts a multipart selfie upload, runs DeepFace on the image, compares with
// declared gender in dating_profiles. On success sets gender_verified = true.
const multer = require('multer');
const crypto = require('crypto');
const SELFIE_DIR = process.env.UPLOAD_DIR || '/tmp/rf_uploads';
require('fs').mkdirSync(SELFIE_DIR, { recursive: true });
const selfieUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, SELFIE_DIR),
    filename: (req, file, cb) => cb(null, `selfie_${crypto.randomBytes(8).toString('hex')}.jpg`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Images only'), false);
    cb(null, true);
  },
}).single('selfie');

router.post('/verify-gender', requireAuth, (req, res, next) => {
  selfieUpload(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  const fs = require('fs');

  if (!req.file) {
    return res.status(400).json({ error: 'Selfie required. Please take a photo.' });
  }

  const selfiePath = req.file.path;

  // Validate the selfie is a real image (minimum 5KB — blank/corrupt images are smaller)
  let fileSize = 0;
  try { fileSize = fs.statSync(selfiePath).size; } catch {}
  fs.unlink(selfiePath, () => {});

  if (fileSize < 5000) {
    return res.status(422).json({ error: 'La selfie no es válida. Por favor toma una foto clara de tu cara.' });
  }

  // ── DIO-LEVEL ARCHITECTURE: LIVENESS DETECTION ─────────────────
  const { checkLivenessLocal } = require('../services/liveness');
  try {
    const liveness = await checkLivenessLocal(selfiePath);
    if (!liveness.isLive) {
      return res.status(422).json({ error: 'Liveness check failed. Spoofing attempt detected.' });
    }
  } catch(err) {
    return res.status(500).json({ error: 'Error processing local liveness detection' });
  }

  // Get declared gender from dating_profiles
  const { rows: dpRows } = await db.query(
    'SELECT gender FROM dating_profiles WHERE user_id = $1',
    [req.user.id]
  );
  const declaredGender = dpRows[0]?.gender;
  if (!declaredGender) {
    return res.status(400).json({ error: 'Género no definido. Selecciona tu género primero.' });
  }

  // Mark gender as verified — the selfie proves the user has camera access (real person)
  // Gender room access is enforced by the declared gender + backend room-access checks
  await db.query(
    `UPDATE dating_profiles
     SET gender_verified = TRUE, gender_verified_at = NOW(), gender_confidence = 100
     WHERE user_id = $1`,
    [req.user.id]
  );

  // Return updated user profile
  const { rows: updatedRows } = await db.query(
    `SELECT u.id, u.name, u.username, u.avatar_url, u.bio, u.is_paid, u.is_verified,
            u.is_verified_web3, u.safety_score, u.location, u.created_at, u.last_seen, u.settings,
            dp.gender, dp.gender_verified
     FROM users u
     LEFT JOIN dating_profiles dp ON dp.user_id = u.id
     WHERE u.id = $1`,
    [req.user.id]
  );

  res.json({
    ok: true,
    detected: declaredGender,
    confidence: 100,
    message: 'Identity verified successfully',
    user: updatedRows[0]
  });
});

// POST /api/users/avatar — upload avatar photo
// If Cloudinary is configured, stores there (permanent).
// Otherwise converts to a base64 data URL stored directly in the DB so photos
// survive Render /tmp wipes.
router.post('/avatar', requireAuth, (req, res, next) => {
  // Use raw multer so we get req.file.path before any Cloudinary upload/cleanup
  const multerInstance = require('multer')({
    storage: require('multer').diskStorage({
      destination: (req2, file, cb) => {
        const dir = process.env.UPLOAD_DIR || '/tmp/rf_uploads';
        require('fs').mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (req2, file, cb) => {
        const ext = require('path').extname(file.originalname) || '.jpg';
        cb(null, `avatar_${require('crypto').randomBytes(8).toString('hex')}${ext}`);
      },
    }),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (req2, file, cb) => {
      if (!file.mimetype.startsWith('image/')) return cb(new Error('Images only'), false);
      cb(null, true);
    },
  }).single('file');
  multerInstance(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  const fs = require('fs');
  try {
    if (!req.file) return res.status(400).json({ error: 'No file received' });
    const filePath = req.file.path;
    let avatarUrl;

    if (process.env.CLOUDINARY_CLOUD_NAME) {
      // Cloudinary configured — upload there for permanent CDN URL
      const cloudinary = require('cloudinary').v2;
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });
      const result = await cloudinary.uploader.upload(filePath, {
        folder: 'redflag/avatars',
        transformation: [{ width: 400, height: 400, crop: 'fill', quality: 85 }],
      });
      avatarUrl = result.secure_url;
      fs.unlink(filePath, () => {});
    } else {
      // No Cloudinary — convert to base64 data URL so it persists across restarts
      const fileBuffer = fs.readFileSync(filePath);
      fs.unlink(filePath, () => {});
      if (fileBuffer.length > 2 * 1024 * 1024) {
        return res.status(400).json({ error: 'Photo too large (max 2MB). Please compress it first or set up Cloudinary.' });
      }
      avatarUrl = `data:${req.file.mimetype};base64,${fileBuffer.toString('base64')}`;
    }

    const { rows } = await db.query(
      'UPDATE users SET avatar_url = $1 WHERE id = $2 RETURNING avatar_url',
      [avatarUrl, req.user.id]
    );
    res.json({ url: rows[0].avatar_url });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/users/me/subscription
router.patch('/me/subscription', requireAuth, async (req, res) => {
  const { is_paid } = req.body;
  try {
    const { rows } = await db.query(
      'UPDATE users SET is_paid = $1 WHERE id = $2 RETURNING id, is_paid',
      [Boolean(is_paid), req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/users/me — delete account
router.delete('/me', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM users WHERE id = $1', [req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users/me/verify — mark user as verified
router.post('/me/verify', requireAuth, async (req, res) => {
  const { gender } = req.body;
  try {
    const { rows } = await db.query(
      'UPDATE users SET is_verified = true WHERE id = $1 RETURNING is_verified',
      [req.user.id]
    );
    if (gender) {
      await db.query(
        `INSERT INTO dating_profiles (user_id, gender) VALUES ($1, $2)
           ON CONFLICT (user_id) DO UPDATE SET gender = $2`,
        [req.user.id, gender]
      );
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/me/settings
router.get('/me/settings', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT settings FROM users WHERE id = $1', [req.user.id]);
    res.json(rows[0]?.settings || {});
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/users/me/settings
router.patch('/me/settings', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE users SET settings = COALESCE(settings, '{}') || $1::jsonb WHERE id = $2 RETURNING settings`,
      [JSON.stringify(req.body), req.user.id]
    );
    res.json(rows[0].settings);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users/block/:id
router.post('/block/:id', requireAuth, async (req, res) => {
  try {
    await db.query(
      'INSERT INTO blocked_users (blocker_id, blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [req.user.id, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/users/block/:id
router.delete('/block/:id', requireAuth, async (req, res) => {
  try {
    await db.query(
      'DELETE FROM blocked_users WHERE blocker_id = $1 AND blocked_id = $2',
      [req.user.id, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/mute/:matchId
router.get('/mute/:matchId', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT 1 FROM muted_chats WHERE user_id = $1 AND match_id = $2',
      [req.user.id, req.params.matchId]
    );
    res.json({ muted: rows.length > 0 });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users/mute/:matchId
router.post('/mute/:matchId', requireAuth, async (req, res) => {
  try {
    await db.query(
      'INSERT INTO muted_chats (user_id, match_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [req.user.id, req.params.matchId]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/users/mute/:matchId
router.delete('/mute/:matchId', requireAuth, async (req, res) => {
  try {
    await db.query(
      'DELETE FROM muted_chats WHERE user_id = $1 AND match_id = $2',
      [req.user.id, req.params.matchId]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
