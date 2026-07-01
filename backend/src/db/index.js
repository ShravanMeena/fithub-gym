import pg from 'pg';
import bcrypt from 'bcryptjs';

// Return timestamps and bigints as friendly JS values (strings / numbers) so the
// rest of the app behaves like it did on SQLite.
pg.types.setTypeParser(1114, (v) => v); // timestamp -> string
pg.types.setTypeParser(1184, (v) => v); // timestamptz -> string
pg.types.setTypeParser(1082, (v) => v); // date -> 'YYYY-MM-DD' string (no tz shift)
pg.types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10))); // int8/bigint -> number

export const pool = new pg.Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || process.env.USER,
  password: process.env.PGPASSWORD || undefined,
  database: process.env.PGDATABASE || 'fithub_test',
  max: 10,
});

// Query helpers. q -> rows[], one -> first row|null, exec -> result.
export async function q(text, params) {
  const r = await pool.query(text, params);
  return r.rows;
}
export async function one(text, params) {
  const r = await pool.query(text, params);
  return r.rows[0] || null;
}
export async function exec(text, params) {
  return pool.query(text, params);
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS organizations (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  tagline TEXT,
  primary_color TEXT NOT NULL DEFAULT '#FF5A1F',
  logo_url TEXT,
  owner_name TEXT,
  contact_email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  org_id INTEGER REFERENCES organizations(id),
  phone TEXT,
  ai_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  gender TEXT, age INTEGER, height_cm REAL, weight_kg REAL,
  goal TEXT, activity_level TEXT, diet_pref TEXT, allergies TEXT,
  target_weight_kg REAL,
  wake_time TEXT, sleep_time TEXT, gym_time TEXT, meals_per_day INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS diet_plans (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_json TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_diet_plans_user ON diet_plans(user_id);

CREATE TABLE IF NOT EXISTS food_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  calories REAL NOT NULL DEFAULT 0,
  protein_g REAL NOT NULL DEFAULT 0,
  carbs_g REAL NOT NULL DEFAULT 0,
  fat_g REAL NOT NULL DEFAULT 0,
  items_json TEXT, source TEXT,
  eaten_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_food_logs_user ON food_logs(user_id, eaten_at);

CREATE TABLE IF NOT EXISTS progress_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weight_kg REAL, body_fat REAL, note TEXT,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_progress_user ON progress_logs(user_id, logged_at);

CREATE TABLE IF NOT EXISTS progress_photos (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image/jpeg',
  visibility TEXT NOT NULL DEFAULT 'private',
  weight_kg REAL, note TEXT,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_photos_user ON progress_photos(user_id, taken_at);

CREATE TABLE IF NOT EXISTS reminders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, body TEXT,
  hour INTEGER NOT NULL, minute INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id);

CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id INTEGER REFERENCES organizations(id),
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_out_at TIMESTAMPTZ,
  reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(user_id, checked_in_at);
CREATE INDEX IF NOT EXISTS idx_attendance_org ON attendance(org_id, checked_in_at);

CREATE TABLE IF NOT EXISTS posts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id INTEGER REFERENCES organizations(id),
  type TEXT NOT NULL DEFAULT 'text',
  content TEXT, media_path TEXT, media_type TEXT,
  is_announcement INTEGER NOT NULL DEFAULT 0,
  is_public INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_posts_org ON posts(org_id, created_at);

CREATE TABLE IF NOT EXISTS post_likes (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS workouts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id INTEGER REFERENCES organizations(id),
  title TEXT NOT NULL DEFAULT 'Workout', notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_workouts_user ON workouts(user_id, created_at);

CREATE TABLE IF NOT EXISTS workout_sets (
  id SERIAL PRIMARY KEY,
  workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise TEXT NOT NULL, weight_kg REAL NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL DEFAULT 0, set_no INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_sets_user_ex ON workout_sets(user_id, exercise);

CREATE TABLE IF NOT EXISTS notices (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL, body TEXT,
  type TEXT NOT NULL DEFAULT 'info',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notices_org ON notices(org_id, active);

CREATE TABLE IF NOT EXISTS notice_responses (
  notice_id INTEGER NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seen_at TIMESTAMPTZ, dismissed INTEGER NOT NULL DEFAULT 0,
  response TEXT, responded_at TIMESTAMPTZ,
  PRIMARY KEY (notice_id, user_id)
);

-- FCM/APNs push tokens, one row per device. user_id may be null until login.
CREATE TABLE IF NOT EXISTS device_tokens (
  token TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  org_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  platform TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_device_tokens_org ON device_tokens(org_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens(user_id);

-- Reminders are delivered by server push: store the device's UTC offset (minutes
-- ahead of UTC, e.g. IST = 330) so the scheduler knows the user's local time,
-- plus a debounce timestamp so we never push the same reminder twice in a minute.
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS tz_offset INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS last_pushed_at TIMESTAMPTZ;

-- Device timezone (minutes ahead of UTC) for evening streak-saver pushes.
ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS tz_offset INTEGER NOT NULL DEFAULT 0;

-- Daily water intake (one row per user per day).
CREATE TABLE IF NOT EXISTS water_intake (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day DATE NOT NULL DEFAULT current_date,
  glasses INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

-- Per-user water goal + hydration reminders.
ALTER TABLE users ADD COLUMN IF NOT EXISTS water_goal INTEGER NOT NULL DEFAULT 8;
ALTER TABLE users ADD COLUMN IF NOT EXISTS water_reminders INTEGER NOT NULL DEFAULT 0;
-- Water is now tracked in millilitres (goal default 3000ml = 3L).
ALTER TABLE water_intake ADD COLUMN IF NOT EXISTS ml INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS water_goal_ml INTEGER NOT NULL DEFAULT 3000;

-- What muscle groups the member trained in a session (comma-separated).
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS focus TEXT;

-- Post hashtags (comma-separated, lowercase, no #) for interest-based feed.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS tags TEXT;

-- Platform-wide key/value settings (e.g. free-trial length), set by superadmin.
CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Per-call AI usage log: tokens + computed cost, attributed to a user.
CREATE TABLE IF NOT EXISTS ai_usage (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  org_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
  feature TEXT NOT NULL,
  model TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage(created_at);

-- Planned rest days that protect a check-in streak.
CREATE TABLE IF NOT EXISTS rest_days (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  PRIMARY KEY (user_id, day)
);

-- Comments on community posts.
CREATE TABLE IF NOT EXISTS post_comments (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Emoji reaction type on a like (one per user per post).
ALTER TABLE post_likes ADD COLUMN IF NOT EXISTS reaction TEXT NOT NULL DEFAULT 'like';
-- Track the highest streak milestone we've auto-celebrated, to avoid repeats.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_streak_milestone INTEGER NOT NULL DEFAULT 0;

-- Profile photo (avatar) per user.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_path TEXT;

-- Share & earn (referrals).
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS coins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by INTEGER REFERENCES users(id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code) WHERE referral_code IS NOT NULL;

-- Body measurements alongside weight (the scale lies, inches don't).
ALTER TABLE progress_logs ADD COLUMN IF NOT EXISTS waist_cm REAL;
ALTER TABLE progress_logs ADD COLUMN IF NOT EXISTS chest_cm REAL;
ALTER TABLE progress_logs ADD COLUMN IF NOT EXISTS arms_cm REAL;

-- Gym-owner-managed info about a member: fees, membership validity, notes.
CREATE TABLE IF NOT EXISTS member_info (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  fee_amount REAL,
  plan TEXT,
  paid_until DATE,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- App update gating (force/soft), one row per platform, managed by superadmin.
CREATE TABLE IF NOT EXISTS app_update (
  platform TEXT PRIMARY KEY,                    -- 'ios' | 'android'
  enabled INTEGER NOT NULL DEFAULT 0,
  mode TEXT NOT NULL DEFAULT 'auto',            -- 'auto' | 'soft' | 'force' | 'off'
  latest_version TEXT NOT NULL DEFAULT '1.0',
  min_version TEXT NOT NULL DEFAULT '1.0',      -- below this => force update
  title TEXT NOT NULL DEFAULT 'Update available',
  message TEXT NOT NULL DEFAULT 'A new version of FitHub is available with improvements and fixes.',
  button_text TEXT NOT NULL DEFAULT 'Update now',
  download_url TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

const SEED_ORGS = [
  { slug: 'a-gym', name: 'A Gym', tagline: 'Where it all begins.', color: '#FF5A1F' },
  { slug: 'z-gym', name: 'Z Gym', tagline: 'The final form.', color: '#7C5CFF' },
];

// Create schema + seed. Call once at startup before serving.
export async function initDb() {
  await pool.query(SCHEMA);
  for (const o of SEED_ORGS) {
    await pool.query(
      `INSERT INTO organizations (slug, name, tagline, primary_color) VALUES ($1,$2,$3,$4)
       ON CONFLICT (slug) DO NOTHING`,
      [o.slug, o.name, o.tagline, o.color]
    );
  }
  // App-update config rows (one per platform), disabled by default.
  for (const p of ['ios', 'android']) {
    await pool.query('INSERT INTO app_update (platform) VALUES ($1) ON CONFLICT (platform) DO NOTHING', [p]);
  }

  // Default free-trial length (days of Premium/AI new members get on signup).
  await pool.query("INSERT INTO platform_settings (key, value) VALUES ('trial_days', '7') ON CONFLICT (key) DO NOTHING");

  // Platform super-admin
  const superEmail = (process.env.SUPERADMIN_EMAIL || 'platform@fithub.app').toLowerCase();
  const superPass = process.env.SUPERADMIN_PASSWORD || 'platform123';
  const existing = await one('SELECT 1 FROM users WHERE email = $1', [superEmail]);
  if (!existing) {
    await pool.query(
      "INSERT INTO users (email, name, password_hash, role) VALUES ($1, 'Platform Admin', $2, 'superadmin')",
      [superEmail, bcrypt.hashSync(superPass, 10)]
    );
  }
  console.log('DB schema ready (PostgreSQL)');
}
