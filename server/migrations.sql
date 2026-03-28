-- RedFlag — Database Migrations (run after schema.sql)
-- These can be run multiple times safely (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)

-- Add settings column to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';

-- Add password reset columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_exp TIMESTAMPTZ;

-- Blocked users table
CREATE TABLE IF NOT EXISTS blocked_users (
  blocker_id  UUID REFERENCES users(id) ON DELETE CASCADE,
  blocked_id  UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id)
);

-- Muted chats table
CREATE TABLE IF NOT EXISTS muted_chats (
  user_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  match_id  TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, match_id)
);

-- Comments table (for Report comments and Post comments)
CREATE TABLE IF NOT EXISTS comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  report_id   UUID REFERENCES reports(id) ON DELETE CASCADE,
  post_id     UUID REFERENCES posts(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  upvotes     INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comments_report ON comments(report_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at ASC);

-- Add height column to dating_profiles (used by Management.jsx)
ALTER TABLE dating_profiles ADD COLUMN IF NOT EXISTS height TEXT;
ALTER TABLE dating_profiles ADD COLUMN IF NOT EXISTS profile_data JSONB DEFAULT '{}';

-- Index for searches
CREATE INDEX IF NOT EXISTS idx_searches_user ON searches(user_id, created_at DESC);

-- Anonymous chat messages (replaces in-memory anonRooms)
CREATE TABLE IF NOT EXISTS anon_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room        TEXT NOT NULL,
  text        TEXT NOT NULL,
  nickname    TEXT,
  avatar      TEXT,
  attachment  TEXT,
  type        TEXT DEFAULT 'text',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_anon_messages_room ON anon_messages(room, created_at ASC);

-- Message expiration support
ALTER TABLE messages ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Guardian sessions (SafeDate / DateCheckIn)
CREATE TABLE IF NOT EXISTS guardian_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT UNIQUE NOT NULL,
  status      TEXT DEFAULT 'active',
  location    TEXT,
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  contacts    JSONB DEFAULT '[]',
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  ended_at    TIMESTAMPTZ
);

-- Trusted contacts (DateCheckIn)
CREATE TABLE IF NOT EXISTS trusted_contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  phone       TEXT,
  email       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- SOS alerts
CREATE TABLE IF NOT EXISTS sos_alerts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  message     TEXT,
  status      TEXT DEFAULT 'active',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Custom emojis
CREATE TABLE IF NOT EXISTS custom_emojis (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  layers      JSONB NOT NULL,
  svg_content TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Extra user columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Extra post columns
ALTER TABLE posts ADD COLUMN IF NOT EXISTS room_id TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_type TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_name TEXT;

-- Gender verification for gender-restricted community rooms
ALTER TABLE dating_profiles ADD COLUMN IF NOT EXISTS gender_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE dating_profiles ADD COLUMN IF NOT EXISTS gender_verified_at TIMESTAMPTZ;
ALTER TABLE dating_profiles ADD COLUMN IF NOT EXISTS gender_confidence NUMERIC(5,2);

-- Edit token for ephemeral report evidence upload (no auth required for evidence upload)
ALTER TABLE reports ADD COLUMN IF NOT EXISTS edit_token TEXT;

-- Location flags (RedFlagMap) — in case schema.sql wasn't run fresh
CREATE TABLE IF NOT EXISTS location_flags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  place_id    TEXT,
  place_name  TEXT,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  flag_type   TEXT NOT NULL DEFAULT 'red',
  comment     TEXT,
  media       JSONB DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_location_flags_lat_lng ON location_flags(lat, lng);


-- Community post flags (moderation reports)
-- Recreated with correct UUID types to match users.id and posts.id
DROP TABLE IF EXISTS post_flags;
CREATE TABLE IF NOT EXISTS post_flags (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID NOT NULL,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason     TEXT NOT NULL DEFAULT 'inappropriate',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_post_flags_post_id ON post_flags(post_id);

-- Push notification subscriptions (web push)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  user_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  subscription TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Relationship column for trusted_contacts (used by contacts route)
ALTER TABLE trusted_contacts ADD COLUMN IF NOT EXISTS relationship TEXT DEFAULT 'friend';

-- reporter_id for /api/reports/me lookup (non-anonymous path)
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reporter_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- reporter_hash on comments (anonymous report comments — mirrors reports.reporter_hash)
ALTER TABLE comments ADD COLUMN IF NOT EXISTS reporter_hash TEXT;

-- reported_user_id links reports to the accused user account (for dating profile red-flag count)
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reported_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_reports_reported_user_id ON reports(reported_user_id);
