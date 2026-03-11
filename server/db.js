const { Pool } = require('pg');

const isLocal = !process.env.DATABASE_URL ||
  process.env.DATABASE_URL.includes('localhost') ||
  process.env.DATABASE_URL.includes('127.0.0.1');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: true },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err.message);
});

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

pool.query(`ALTER TABLE dating_profiles ADD COLUMN IF NOT EXISTS height TEXT`).catch(() => {});
pool.query(`ALTER TABLE dating_profiles ADD COLUMN IF NOT EXISTS profile_data JSONB DEFAULT '{}'`).catch(() => {});

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
