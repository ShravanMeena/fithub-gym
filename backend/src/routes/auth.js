import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db/index.js';
import { signToken, authRequired } from '../middleware/auth.js';
import { hasAiAccess } from '../middleware/ai.js';

const router = Router();

const signupSchema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(6).max(100),
  org_id: z.number().int().optional(),
  org_slug: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function orgFor(id) {
  if (!id) return null;
  return db
    .prepare('SELECT id, slug, name, tagline, primary_color, logo_url FROM organizations WHERE id = ?')
    .get(id);
}

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    org: orgFor(u.org_id),
    ai_until: u.ai_until || null,
    ai_active: hasAiAccess(u.id),
  };
}

function resolveOrgId({ org_id, org_slug }) {
  if (org_id) return org_id;
  if (org_slug) {
    const o = db.prepare('SELECT id FROM organizations WHERE slug = ?').get(org_slug);
    return o?.id;
  }
  return undefined;
}

router.post('/signup', (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { name, email, password } = parsed.data;
  const orgId = resolveOrgId(parsed.data);
  if (!orgId) return res.status(400).json({ error: 'Select your gym first' });
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare('INSERT INTO users (email, name, password_hash, org_id) VALUES (?, ?, ?, ?)')
    .run(email.toLowerCase(), name, hash, orgId);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  // create empty profile row
  db.prepare('INSERT OR IGNORE INTO profiles (user_id) VALUES (?)').run(user.id);

  res.json({ token: signToken(user), user: publicUser(user) });
});

router.post('/login', (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { email, password } = parsed.data;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get('/me', authRequired, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: publicUser(user) });
});

export default router;
