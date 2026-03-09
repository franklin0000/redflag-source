-- RedFlag — Complete PostgreSQL Schema
-- Run this once on your Render PostgreSQL database

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- for text search

-- ── USERS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  username      TEXT UNIQUE,
  avatar_url    TEXT,
  bio           TEXT,
  is_paid       BOOLEAN DEFAULT FALSE,
  is_verified   BOOLEAN DEFAULT FALSE,
  is_verified_web3 BOOLEAN DEFAULT FALSE,
  is_admin      BOOLEAN DEFAULT FALSE,
  safety_score  INTEGER DEFAULT 50,
  location      TEXT,
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  phone         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_seen     TIMESTAMPTZ DEFAULT NOW(),
  refresh_token TEXT
);

-- ── DATING PROFILES ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dating_profiles (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  bio           TEXT,
  age           INTEGER,
  gender        TEXT,
  photos        TEXT[] DEFAULT '{}',
  interests     TEXT[] DEFAULT '{}',
  location      TEXT,
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  is_active     BOOLEAN DEFAULT TRUE,
  safety_score  INTEGER DEFAULT 50,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── SWIPES ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS swipes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  swiper_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  swiped_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  direction     TEXT CHECK (direction IN ('left','right','superlike')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(swiper_id, swiped_id)
);

-- ── MATCHES ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS matches (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user1_id        UUID REFERENCES users(id) ON DELETE CASCADE,
  user2_id        UUID REFERENCES users(id) ON DELETE CASCADE,
  last_message    TEXT,
  last_message_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user1_id, user2_id)
);

-- ── MESSAGES ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id    UUID REFERENCES matches(id) ON DELETE CASCADE,
  sender_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  iv          TEXT,
  is_read     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── POSTS (Community) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS posts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  media_url   TEXT,
  reactions   JSONB DEFAULT '{"❤️":0,"🚩":0,"👀":0,"🤮":0}',
  replies     JSONB DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── REPORTS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  reported_name   TEXT NOT NULL,
  platform        TEXT,
  evidence_urls   TEXT[] DEFAULT '{}',
  description     TEXT,
  category        TEXT,
  status          TEXT DEFAULT 'pending',
  upvotes         INTEGER DEFAULT 0,
  nft_token_id    TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── SEARCHES ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS searches (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  query       TEXT,
  results     JSONB DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── NOTIFICATIONS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  title       TEXT,
  body        TEXT,
  data        JSONB DEFAULT '{}',
  is_read     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── SAFE RIDE SESSIONS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS safe_ride_sessions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  status      TEXT DEFAULT 'active',
  origin      TEXT,
  destination TEXT,
  dest_lat    DOUBLE PRECISION,
  dest_lng    DOUBLE PRECISION,
  guardian_id UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  ended_at    TIMESTAMPTZ
);

-- ── DATE PLANS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS date_plans (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  match_id    UUID REFERENCES matches(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  location    TEXT,
  date_time   TIMESTAMPTZ,
  notes       TEXT,
  status      TEXT DEFAULT 'planned',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── INDEXES ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_dating_profiles_location ON dating_profiles(lat, lng) WHERE lat IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_match_id ON messages(match_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_users ON matches(user1_id, user2_id);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_swipes_swiper ON swipes(swiper_id);

-- ── GEO MATCH FUNCTION ────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_matches_by_distance(
  p_user_id UUID,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_max_km INTEGER DEFAULT 100,
  p_limit INTEGER DEFAULT 50
) RETURNS TABLE (
  user_id UUID, name TEXT, age INTEGER, bio TEXT,
  photos TEXT[], interests TEXT[], safety_score INTEGER,
  location TEXT, lat DOUBLE PRECISION, lng DOUBLE PRECISION,
  distance_km DOUBLE PRECISION, gender TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id, u.name, dp.age, dp.bio,
    dp.photos, dp.interests, dp.safety_score,
    dp.location, dp.lat, dp.lng,
    ROUND((6371 * acos(
      LEAST(1.0, GREATEST(-1.0,
        cos(radians(p_lat)) * cos(radians(dp.lat)) *
        cos(radians(dp.lng) - radians(p_lng)) +
        sin(radians(p_lat)) * sin(radians(dp.lat))
      ))
    ))::numeric, 1)::DOUBLE PRECISION AS distance_km,
    dp.gender
  FROM dating_profiles dp
  JOIN users u ON u.id = dp.user_id
  WHERE dp.is_active = TRUE
    AND dp.user_id != p_user_id
    AND dp.lat IS NOT NULL
    AND dp.user_id NOT IN (
      SELECT swiped_id FROM swipes WHERE swiper_id = p_user_id
    )
    AND (
      p_max_km IS NULL OR
      (6371 * acos(
        LEAST(1.0, GREATEST(-1.0,
          cos(radians(p_lat)) * cos(radians(dp.lat)) *
          cos(radians(dp.lng) - radians(p_lng)) +
          sin(radians(p_lat)) * sin(radians(dp.lat))
        ))
      )) <= p_max_km
    )
  ORDER BY distance_km ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
