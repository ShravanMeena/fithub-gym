import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../db/index.js';

const router = Router();

const slugify = (s) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'gym';

// Readable temp password, e.g. "Fit-7K3M9Q". Admin can change it later.
function genPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (const b of crypto.randomBytes(6)) s += chars[b % chars.length];
  return `Fit-${s}`;
}

const createSchema = z.object({
  name: z.string().min(2).max(60),
  tagline: z.string().max(120).optional(),
  primary_color: z.string().regex(/^#?[0-9a-fA-F]{6}$/).optional(),
  owner_name: z.string().min(1).max(80),
  contact_email: z.string().email(),
  phone: z.string().min(5).max(20).optional(),
  password: z.string().min(6).max(100).optional(), // admin picks one; auto-generated if omitted
});

// Public: register a new gym. Creates the gym AND its admin login (generated password).
router.post('/', (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;
  const email = d.contact_email.toLowerCase();

  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'That email is already registered. Use a different one.' });
  }

  // unique slug
  let base = slugify(d.name);
  let slug = base;
  let n = 1;
  while (db.prepare('SELECT 1 FROM organizations WHERE slug = ?').get(slug)) slug = `${base}-${++n}`;

  const color = d.primary_color ? (d.primary_color.startsWith('#') ? d.primary_color : `#${d.primary_color}`) : '#FF5A1F';
  const generated = !d.password;
  const password = d.password || genPassword();

  const tx = db.transaction(() => {
    const orgInfo = db
      .prepare(
        `INSERT INTO organizations (slug, name, tagline, primary_color, owner_name, contact_email, phone)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(slug, d.name.trim(), d.tagline?.trim() || null, color, d.owner_name.trim(), email, d.phone || null);
    const orgId = orgInfo.lastInsertRowid;

    const userInfo = db
      .prepare('INSERT INTO users (email, name, password_hash, role, org_id, phone) VALUES (?, ?, ?, ?, ?, ?)')
      .run(email, d.owner_name.trim(), bcrypt.hashSync(password, 10), 'admin', orgId, d.phone || null);
    db.prepare('INSERT OR IGNORE INTO profiles (user_id) VALUES (?)').run(userInfo.lastInsertRowid);
    return orgId;
  });
  const orgId = tx();

  const org = db.prepare('SELECT id, slug, name, tagline, primary_color FROM organizations WHERE id = ?').get(orgId);
  // Echo the password back ONLY if we generated it (so the owner can save it).
  res.json({ organization: org, admin: { name: d.owner_name.trim(), email, password: generated ? password : undefined, generated } });
});

// Public: list organizations for the "choose your gym" screen.
router.get('/', (req, res) => {
  const orgs = db
    .prepare('SELECT id, slug, name, tagline, primary_color, logo_url FROM organizations ORDER BY name')
    .all();
  res.json({ organizations: orgs });
});

// Public: branding for a single org (by slug).
router.get('/:slug', (req, res) => {
  const org = db
    .prepare('SELECT id, slug, name, tagline, primary_color, logo_url FROM organizations WHERE slug = ?')
    .get(req.params.slug);
  if (!org) return res.status(404).json({ error: 'Gym not found' });
  res.json({ organization: org });
});

export default router;
