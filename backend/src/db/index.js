import pg from 'pg';
import bcrypt from 'bcryptjs';

// Return timestamps and bigints as friendly JS values (strings / numbers) so the
// rest of the app behaves like it did on SQLite.
pg.types.setTypeParser(1114, (v) => v); // timestamp -> string
pg.types.setTypeParser(1184, (v) => v); // timestamptz -> string
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
`;

const SEED_ORGS = [
  { slug: 'x-gym', name: 'X Gym', tagline: 'Push your limits.', color: '#FF5A1F' },
  { slug: 'iron-paradise', name: 'Iron Paradise', tagline: 'Where legends are forged.', color: '#22D3EE' },
  { slug: 'fithub', name: 'FitHub Demo', tagline: 'Train. Eat. Track.', color: '#23D18B' },
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
