const { Pool } = require('pg');

const isLocal = !process.env.DATABASE_URL ||
  process.env.DATABASE_URL.includes('localhost') ||
  process.env.DATABASE_URL.includes('127.0.0.1');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err.message);
});

// Auto-migrate: get_matches_by_distance PostgreSQL function
pool.query(`
  CREATE OR REPLACE FUNCTION get_matches_by_distance(
    uid UUID, user_lat DOUBLE PRECISION, user_lng DOUBLE PRECISION,
    radius_km DOUBLE PRECISION, lim INT
  )
  RETURNS TABLE(
    id UUID, user_id UUID, gender TEXT, bio TEXT, age INT, interests TEXT[],
    looking_for TEXT, lat DOUBLE PRECISION, lng DOUBLE PRECISION,
    distance_km DOUBLE PRECISION, profile_data JSONB, height TEXT,
    users_name TEXT, users_avatar TEXT, users_verified BOOLEAN
  ) AS $$
  BEGIN
    RETURN QUERY
    SELECT dp.id, dp.user_id, dp.gender, dp.bio, dp.age, dp.interests,
           dp.looking_for, dp.lat, dp.lng,
           (point(dp.lng, dp.lat) <@> point(user_lng, user_lat)) * 1.60934 AS distance_km,
           dp.profile_data, dp.height,
           u.name AS users_name, u.avatar_url AS users_avatar, u.is_verified AS users_verified
    FROM dating_profiles dp
    JOIN users u ON u.id = dp.user_id
    WHERE dp.user_id != uid
      AND dp.lat IS NOT NULL AND dp.lng IS NOT NULL
      AND (point(dp.lng, dp.lat) <@> point(user_lng, user_lat)) * 1.60934 <= radius_km
      AND dp.user_id NOT IN (
        SELECT swiped_id FROM swipes WHERE swiper_id = uid
      )
    ORDER BY distance_km ASC
    LIMIT lim;
  END;
  $$ LANGUAGE plpgsql;
`).catch(err => console.error('Migration error (get_matches_by_distance):', err.message));

// Auto-migrate: add room_id to posts, expires_at to messages
pool.query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS room_id TEXT DEFAULT 'general'`).catch(() => { });
pool.query(`CREATE INDEX IF NOT EXISTS idx_posts_room ON posts(room_id, created_at DESC)`).catch(() => { });
pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')`).catch(() => { });

// Auto-migrate dating columns
pool.query(`ALTER TABLE dating_profiles ADD COLUMN IF NOT EXISTS looking_for TEXT`).catch(() => { });
pool.query(`ALTER TABLE dating_profiles ADD COLUMN IF NOT EXISTS gender TEXT`).catch(() => { });
pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT`).catch(() => { });

// Auto-migrate: ensure comments table exists
pool.query(`
  CREATE TABLE IF NOT EXISTS comments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    report_id   UUID,
    post_id     UUID,
    content     TEXT NOT NULL,
    upvotes     INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(err => console.error('Migration error (comments):', err.message));

pool.query(`ALTER TABLE dating_profiles ADD COLUMN IF NOT EXISTS height TEXT`).catch(() => { });
pool.query(`ALTER TABLE dating_profiles ADD COLUMN IF NOT EXISTS profile_data JSONB DEFAULT '{}'`).catch(() => { });

// Auto-migrate: trusted_contacts
pool.query(`
  CREATE TABLE IF NOT EXISTS trusted_contacts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    phone        TEXT NOT NULL,
    relationship TEXT DEFAULT 'friend',
    created_at   TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(err => console.error('Migration error (trusted_contacts):', err.message));

// Auto-migrate: guardian_sessions
pool.query(`
  CREATE TABLE IF NOT EXISTS guardian_sessions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dater_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token    TEXT UNIQUE NOT NULL,
    dater_name       TEXT,
    date_location    TEXT,
    check_in_minutes INT DEFAULT 30,
    expires_at       TIMESTAMPTZ,
    is_active        BOOLEAN DEFAULT TRUE,
    is_sos           BOOLEAN DEFAULT FALSE,
    sentiment        TEXT DEFAULT 'normal',
    last_checkin_at  TIMESTAMPTZ DEFAULT NOW(),
    location         JSONB,
    created_at       TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(err => console.error('Migration error (guardian_sessions):', err.message));

// Auto-migrate: sos_alerts
pool.query(`
  CREATE TABLE IF NOT EXISTS sos_alerts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id   UUID REFERENCES guardian_sessions(id) ON DELETE CASCADE,
    location     JSONB,
    triggered_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(err => console.error('Migration error (sos_alerts):', err.message));

// Auto-migrate: ensure location_flags table exists
pool.query(`
  CREATE TABLE IF NOT EXISTS location_flags (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
    place_id   TEXT,
    place_name TEXT,
    lat        DOUBLE PRECISION NOT NULL,
    lng        DOUBLE PRECISION NOT NULL,
    flag_type  TEXT NOT NULL DEFAULT 'red',
    comment    TEXT,
    media      JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(err => console.error('Migration error (location_flags):', err.message));

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
