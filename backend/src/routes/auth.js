import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { q, one, exec } from '../db/index.js';
import { signToken, authRequired } from '../middleware/auth.js';
import { applyReferral, ensureReferralCode } from '../services/referral.js';
import { getTrialDays } from '../services/settings.js';
import { deleteFile } from '../services/storage.js';

const router = Router();

const signupSchema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().max(120).optional(),
  password: z.string().min(6).max(100),
  phone: z.string().max(20).optional(),
  referral_code: z.string().max(20).optional(),
  org_id: z.number().int().optional(),
  org_slug: z.string().optional(),
});

// Login by email OR phone (whichever the user typed) + password.
const loginSchema = z.object({
  email: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  identifier: z.string().min(1).optional(),
  password: z.string().min(1),
});

async function orgFor(id) {
  if (!id) return null;
  return one('SELECT id, slug, name, tagline, primary_color, logo_url FROM organizations WHERE id = $1', [id]);
}

// u must include ai_active (computed in the fetch query).
async function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    org: await orgFor(u.org_id),
    ai_until: u.ai_until || null,
    ai_active: !!u.ai_active,
  };
}

const USER_COLS = "id, name, email, role, org_id, ai_until, (ai_until IS NOT NULL AND ai_until > now()) AS ai_active";

async function resolveOrgId({ org_id, org_slug }) {
  if (org_id) return org_id;
  if (org_slug) {
    const o = await one('SELECT id FROM organizations WHERE slug = $1', [org_slug]);
    return o?.id;
  }
  return undefined;
}

router.post('/signup', async (req, res, next) => {
  try {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const { name, password, referral_code } = parsed.data;
    const email = (parsed.data.email || '').trim().toLowerCase() || null;
    const phone = (parsed.data.phone || '').trim() || null;
    if (!email && !phone) return res.status(400).json({ error: 'Enter an email or phone number' });
    const orgId = await resolveOrgId(parsed.data);
    if (!orgId) return res.status(400).json({ error: 'Select your gym first' });
    if (email && await one('SELECT 1 FROM users WHERE lower(email) = $1', [email])) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    if (phone && await one('SELECT 1 FROM users WHERE phone = $1', [phone])) {
      return res.status(409).json({ error: 'Phone number already registered' });
    }
    const hash = bcrypt.hashSync(password, 10);
    const ins = await one(
      `INSERT INTO users (email, name, password_hash, org_id, phone) VALUES ($1,$2,$3,$4,$5) RETURNING id, email`,
      [email, name, hash, orgId, phone]
    );
    // Grant the free Premium trial (configurable by superadmin).
    const trialDays = await getTrialDays();
    if (trialDays > 0) {
      await exec('UPDATE users SET ai_until = now() + make_interval(days => $1) WHERE id = $2', [trialDays, ins.id]);
    }
    await exec('INSERT INTO profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [ins.id]);
    await ensureReferralCode(ins.id);
    if (referral_code) await applyReferral(ins.id, referral_code).catch(() => {});
    const pub = await one(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [ins.id]);
    res.json({ token: signToken(ins), user: await publicUser(pub) });
  } catch (e) { next(e); }
});

router.post('/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const { password } = parsed.data;
    const idf = (parsed.data.identifier || parsed.data.email || parsed.data.phone || '').trim();
    if (!idf) return res.status(400).json({ error: 'Enter your email or phone number' });
    const user = await one('SELECT * FROM users WHERE lower(email) = lower($1) OR phone = $1', [idf]);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid login or password' });
    }
    const pub = await one(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [user.id]);
    res.json({ token: signToken(user), user: await publicUser(pub) });
  } catch (e) { next(e); }
});

router.get('/me', authRequired, async (req, res, next) => {
  try {
    const u = await one(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [req.user.id]);
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json({ user: await publicUser(u) });
  } catch (e) { next(e); }
});

// Permanently delete the account and all its data (profile, posts, photos, logs,
// reminders, attendance, tokens). Required in-app by Google Play.
router.delete('/account', authRequired, async (req, res, next) => {
  try {
    const uid = req.user.id;
    // Delete the user's files from storage (DB cascade won't touch GCS/disk).
    const u = await one('SELECT avatar_path FROM users WHERE id = $1', [uid]);
    const photos = await q('SELECT file_path FROM progress_photos WHERE user_id = $1', [uid]);
    const posts = await q('SELECT media_path FROM posts WHERE user_id = $1', [uid]);
    const paths = [u?.avatar_path, ...photos.map((p) => p.file_path), ...posts.map((p) => p.media_path)].filter(Boolean);
    for (const p of paths) await deleteFile(p).catch(() => {});
    // Unlink anyone this user referred (that FK has no cascade), then delete → cascades the rest.
    await exec('UPDATE users SET referred_by = NULL WHERE referred_by = $1', [uid]);
    await one('DELETE FROM users WHERE id = $1 RETURNING id', [uid]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
