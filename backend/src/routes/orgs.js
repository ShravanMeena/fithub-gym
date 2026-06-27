import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { q, one, pool } from '../db/index.js';

const router = Router();

const slugify = (s) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'gym';

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
  password: z.string().min(6).max(100).optional(),
});

router.post('/', async (req, res, next) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;
  const email = d.contact_email.toLowerCase();

  const client = await pool.connect();
  try {
    if (await one('SELECT 1 FROM users WHERE email = $1', [email])) {
      return res.status(409).json({ error: 'That email is already registered. Use a different one.' });
    }
    let base = slugify(d.name), slug = base, n = 1;
    while (await one('SELECT 1 FROM organizations WHERE slug = $1', [slug])) slug = `${base}-${++n}`;

    const color = d.primary_color ? (d.primary_color.startsWith('#') ? d.primary_color : `#${d.primary_color}`) : '#FF5A1F';
    const generated = !d.password;
    const password = d.password || genPassword();

    await client.query('BEGIN');
    const org = (await client.query(
      `INSERT INTO organizations (slug, name, tagline, primary_color, owner_name, contact_email, phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, slug, name, tagline, primary_color`,
      [slug, d.name.trim(), d.tagline?.trim() || null, color, d.owner_name.trim(), email, d.phone || null]
    )).rows[0];
    const user = (await client.query(
      "INSERT INTO users (email, name, password_hash, role, org_id, phone) VALUES ($1,$2,$3,'admin',$4,$5) RETURNING id",
      [email, d.owner_name.trim(), bcrypt.hashSync(password, 10), org.id, d.phone || null]
    )).rows[0];
    await client.query('INSERT INTO profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
    await client.query('COMMIT');

    res.json({ organization: org, admin: { name: d.owner_name.trim(), email, password: generated ? password : undefined, generated } });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    next(e);
  } finally {
    client.release();
  }
});

router.get('/', async (req, res, next) => {
  try {
    const organizations = await q('SELECT id, slug, name, tagline, primary_color, logo_url FROM organizations ORDER BY name');
    res.json({ organizations });
  } catch (e) { next(e); }
});

router.get('/:slug', async (req, res, next) => {
  try {
    const org = await one('SELECT id, slug, name, tagline, primary_color, logo_url FROM organizations WHERE slug = $1', [req.params.slug]);
    if (!org) return res.status(404).json({ error: 'Gym not found' });
    res.json({ organization: org });
  } catch (e) { next(e); }
});

export default router;
