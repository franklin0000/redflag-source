const jwt = require('jsonwebtoken');
const db = require('../db');

if (process.env.NODE_ENV === 'production' && \!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required in production');
}
const JWT_SECRET = process.env.JWT_SECRET || 'redflag-dev-secret-change-in-prod';

function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '7d' });
}

function signRefreshToken(userId) {
  return jwt.sign({ sub: userId, type: 'refresh' }, JWT_SECRET, { expiresIn: '30d' });
}

// Shared query: load user + gender from dating_profiles in one call
const USER_WITH_GENDER_QUERY = `
  SELECT u.*, dp.gender, dp.gender_verified
  FROM users u
  LEFT JOIN dating_profiles dp ON dp.user_id = u.id
  WHERE u.id = $1
`;

async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const { rows } = await db.query(USER_WITH_GENDER_QUERY, [payload.sub]);
    if (!rows.length) return res.status(401).json({ error: 'User not found' });
    req.user = rows[0];
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

async function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const { rows } = await db.query(USER_WITH_GENDER_QUERY, [payload.sub]);
    if (rows.length) req.user = rows[0];
    req.userId = payload.sub;
  } catch {}
  next();
}

module.exports = { requireAuth, optionalAuth, signToken, signRefreshToken, JWT_SECRET };
