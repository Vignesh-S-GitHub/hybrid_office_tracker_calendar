CREATE TABLE train_reminders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  data TEXT NOT NULL CHECK(json_valid(data)),
  booking_at INTEGER NOT NULL,
  journey_date TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  schedule_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','booked','cancelled','needs_review')),
  created_at INTEGER NOT NULL
);
CREATE TRIGGER train_capacity BEFORE INSERT ON train_reminders
WHEN (SELECT COUNT(*) FROM train_reminders WHERE user_id = NEW.user_id) >= 200
BEGIN
  SELECT RAISE(ABORT, 'train_capacity');
END;
CREATE INDEX train_user ON train_reminders(user_id, journey_date);
CREATE TABLE telegram_connections (
  user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL UNIQUE,
  blocked INTEGER NOT NULL DEFAULT 0,
  last_test_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE telegram_pair_codes (
  user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE reminder_deliveries (
  id TEXT PRIMARY KEY,
  reminder_id TEXT NOT NULL REFERENCES train_reminders(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  kind TEXT NOT NULL,
  due_at INTEGER NOT NULL,
  next_attempt INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','leased','sent','skipped','error')),
  lease_until INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER,
  error TEXT,
  UNIQUE(reminder_id, revision, kind)
);
CREATE INDEX delivery_due ON reminder_deliveries(state, next_attempt);
CREATE TABLE reminder_rate_limits (
  user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
