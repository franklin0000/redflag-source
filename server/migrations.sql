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

-- Index for searches
CREATE INDEX IF NOT EXISTS idx_searches_user ON searches(user_id, created_at DESC);
