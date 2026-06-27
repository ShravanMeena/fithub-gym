import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', '..', 'data');
mkdirSync(dataDir, { recursive: true });

export const db = new Database(join(dataDir, 'gym.sqlite'));
db.pragma('journal_mode = WAL');

db.exec(`
-- White-label tenants. Each gym is an organization with its own branding.
CREATE TABLE IF NOT EXISTS organizations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  tagline       TEXT,
  primary_color TEXT NOT NULL DEFAULT '#FF5A1F',
  logo_url      TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member',  -- member | trainer | admin
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Gym attendance / check-ins.
CREATE TABLE IF NOT EXISTS attendance (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id         INTEGER REFERENCES organizations(id),
  checked_in_at  TEXT NOT NULL DEFAULT (datetime('now')),
  checked_out_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(user_id, checked_in_at);
CREATE INDEX IF NOT EXISTS idx_attendance_org ON attendance(org_id, checked_in_at);

-- Social feed posts (text / image / video), scoped to an org.
CREATE TABLE IF NOT EXISTS posts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id      INTEGER REFERENCES organizations(id),
  type        TEXT NOT NULL DEFAULT 'text',  -- text | image | video
  content     TEXT,
  media_path  TEXT,
  media_type  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_posts_org ON posts(org_id, created_at);

CREATE TABLE IF NOT EXISTS post_likes (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, user_id)
);

-- Workout sessions + the sets logged in each.
CREATE TABLE IF NOT EXISTS workouts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id     INTEGER REFERENCES organizations(id),
  title      TEXT NOT NULL DEFAULT 'Workout',
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_workouts_user ON workouts(user_id, created_at);

CREATE TABLE IF NOT EXISTS workout_sets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise   TEXT NOT NULL,
  weight_kg  REAL NOT NULL DEFAULT 0,
  reps       INTEGER NOT NULL DEFAULT 0,
  set_no     INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_sets_user_ex ON workout_sets(user_id, exercise);

-- Admin-pushed home-screen notices (highlighted, dismissible, trackable).
CREATE TABLE IF NOT EXISTS notices (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id     INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT,
  type       TEXT NOT NULL DEFAULT 'info',  -- info | ack | yesno
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notices_org ON notices(org_id, active);

CREATE TABLE IF NOT EXISTS notice_responses (
  notice_id    INTEGER NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seen_at      TEXT,
  dismissed    INTEGER NOT NULL DEFAULT 0,
  response     TEXT,                          -- yes | no | ack | null
  responded_at TEXT,
  PRIMARY KEY (notice_id, user_id)
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  gender         TEXT,
  age            INTEGER,
  height_cm      REAL,
  weight_kg      REAL,
  goal           TEXT,          -- lose_fat | build_muscle | maintain | recomp
  activity_level TEXT,          -- sedentary | light | moderate | active | very_active
  diet_pref      TEXT,          -- veg | nonveg | vegan | eggetarian
  allergies      TEXT,
  target_weight_kg REAL,
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One generated diet plan per user (latest). plan_json holds the full structured plan.
CREATE TABLE IF NOT EXISTS diet_plans (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_json   TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_diet_plans_user ON diet_plans(user_id);

-- Food log entries (meals the user actually ate, from photo scan or manual)
CREATE TABLE IF NOT EXISTS food_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  calories    REAL NOT NULL DEFAULT 0,
  protein_g   REAL NOT NULL DEFAULT 0,
  carbs_g     REAL NOT NULL DEFAULT 0,
  fat_g       REAL NOT NULL DEFAULT 0,
  items_json  TEXT,             -- breakdown of detected items
  source      TEXT,             -- photo | manual
  eaten_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_food_logs_user ON food_logs(user_id, eaten_at);

-- Progress measurements (weight, body fat, etc.)
CREATE TABLE IF NOT EXISTS progress_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weight_kg   REAL,
  body_fat    REAL,
  note        TEXT,
  logged_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_progress_user ON progress_logs(user_id, logged_at);

-- Progress photos (physique pics). Stored on disk; row holds the path + visibility.
CREATE TABLE IF NOT EXISTS progress_photos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_path   TEXT NOT NULL,
  media_type  TEXT NOT NULL DEFAULT 'image/jpeg',
  visibility  TEXT NOT NULL DEFAULT 'private',  -- private | public
  weight_kg   REAL,
  note        TEXT,
  taken_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_photos_user ON progress_photos(user_id, taken_at);
CREATE INDEX IF NOT EXISTS idx_photos_public ON progress_photos(visibility);

-- Reminders (diet/meal alarms) — synced so the app can schedule local notifications
CREATE TABLE IF NOT EXISTS reminders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT,
  hour        INTEGER NOT NULL,   -- 0-23
  minute      INTEGER NOT NULL,   -- 0-59
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id);
`);

// Lightweight migrations: add columns to existing DBs (ignore if already there).
for (const [col, type] of [
  ['wake_time', 'TEXT'],
  ['sleep_time', 'TEXT'],
  ['gym_time', 'TEXT'],
  ['meals_per_day', 'INTEGER'],
]) {
  try { db.exec(`ALTER TABLE profiles ADD COLUMN ${col} ${type}`); } catch { /* exists */ }
}
try { db.exec(`ALTER TABLE users ADD COLUMN org_id INTEGER REFERENCES organizations(id)`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE organizations ADD COLUMN owner_name TEXT`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE organizations ADD COLUMN contact_email TEXT`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE organizations ADD COLUMN phone TEXT`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE users ADD COLUMN phone TEXT`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE attendance ADD COLUMN reason TEXT`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE users ADD COLUMN ai_until TEXT`); } catch { /* exists */ } // AI subscription expiry (UTC datetime)
try { db.exec(`ALTER TABLE posts ADD COLUMN is_announcement INTEGER NOT NULL DEFAULT 0`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE posts ADD COLUMN is_public INTEGER NOT NULL DEFAULT 1`); } catch { /* exists */ }

// Seed the PLATFORM super-admin (the company). Not tied to any gym (org_id NULL).
const SUPER_EMAIL = (process.env.SUPERADMIN_EMAIL || 'platform@fithub.app').toLowerCase();
const SUPER_PASS = process.env.SUPERADMIN_PASSWORD || 'platform123';
if (!db.prepare('SELECT 1 FROM users WHERE email = ?').get(SUPER_EMAIL)) {
  db.prepare("INSERT INTO users (email, name, password_hash, role) VALUES (?, 'Platform Admin', ?, 'superadmin')")
    .run(SUPER_EMAIL, bcrypt.hashSync(SUPER_PASS, 10));
}

// Seed organizations (white-label tenants). idempotent.
const seedOrgs = [
  { slug: 'x-gym', name: 'X Gym', tagline: 'Push your limits.', primary_color: '#FF5A1F' },
  { slug: 'iron-paradise', name: 'Iron Paradise', tagline: 'Where legends are forged.', primary_color: '#22D3EE' },
  { slug: 'fithub', name: 'FitHub Demo', tagline: 'Train. Eat. Track.', primary_color: '#23D18B' },
];
const insertOrg = db.prepare(
  'INSERT OR IGNORE INTO organizations (slug, name, tagline, primary_color) VALUES (@slug, @name, @tagline, @primary_color)'
);
for (const o of seedOrgs) insertOrg.run(o);

// Backfill any users with no org to X Gym so existing accounts keep working.
const xgym = db.prepare("SELECT id FROM organizations WHERE slug = 'x-gym'").get();
if (xgym) db.prepare('UPDATE users SET org_id = ? WHERE org_id IS NULL').run(xgym.id);

export default db;
