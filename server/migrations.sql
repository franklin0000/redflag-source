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
