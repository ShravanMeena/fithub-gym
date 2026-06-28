import { Router } from 'express';
import { z } from 'zod';
import { q, one } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { sendToTokens, pushEnabled } from '../services/push.js';

const router = Router();
router.use(authRequired);

router.use(async (req, res, next) => {
  try {
    const u = await one('SELECT role FROM users WHERE id = $1', [req.user.id]);
    if (!u || u.role !== 'superadmin') return res.status(403).json({ error: 'Platform admin only' });
    next();
  } catch (e) { next(e); }
});

router.get('/stats', async (req, res, next) => {
  try {
    const gyms = (await one('SELECT COUNT(*) AS c FROM organizations'))?.c || 0;
    const users = (await one("SELECT COUNT(*) AS c FROM users WHERE role != 'superadmin'"))?.c || 0;
    const aiActive = (await one("SELECT COUNT(*) AS c FROM users WHERE ai_until IS NOT NULL AND ai_until > now()"))?.c || 0;
    res.json({ gyms, users, aiActive });
  } catch (e) { next(e); }
});

router.get('/gyms', async (req, res, next) => {
  try {
    const gyms = await q(
      `SELECT o.id, o.slug, o.name, o.primary_color, o.owner_name, o.contact_email, o.phone, o.created_at,
        (SELECT COUNT(*) FROM users u WHERE u.org_id = o.id) AS members,
        (SELECT COUNT(*) FROM users u WHERE u.org_id = o.id AND u.ai_until > now()) AS ai_members
       FROM organizations o ORDER BY o.created_at DESC`
    );
    res.json({ gyms });
  } catch (e) { next(e); }
});

router.get('/users', async (req, res, next) => {
  try {
    const term = `%${(req.query.q || '').toString().toLowerCase()}%`;
    const users = await q(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.ai_until,
        (u.ai_until IS NOT NULL AND u.ai_until > now()) AS ai_active, o.name AS gym
       FROM users u LEFT JOIN organizations o ON o.id = u.org_id
       WHERE u.role != 'superadmin' AND (lower(u.name) LIKE $1 OR lower(u.email) LIKE $1 OR lower(o.name) LIKE $1)
       ORDER BY u.created_at DESC LIMIT 300`,
      [term]
    );
    res.json({ users });
  } catch (e) { next(e); }
});

const grantSchema = z.object({ days: z.number().int().min(0).max(3650) });
router.post('/users/:id/ai-access', async (req, res, next) => {
  try {
    const parsed = grantSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'days must be 0–3650' });
    const { days } = parsed.data;
    const u = await one("SELECT id FROM users WHERE id = $1 AND role != 'superadmin'", [req.params.id]);
    if (!u) return res.status(404).json({ error: 'User not found' });

    if (days === 0) {
      await one('UPDATE users SET ai_until = NULL WHERE id = $1 RETURNING id', [u.id]);
    } else {
      await one(
        `UPDATE users SET ai_until = (CASE WHEN ai_until > now() THEN ai_until ELSE now() END) + make_interval(days => $1)
         WHERE id = $2 RETURNING id`,
        [days, u.id]
      );
    }
    const row = await one("SELECT ai_until, (ai_until IS NOT NULL AND ai_until > now()) AS ai_active FROM users WHERE id = $1", [u.id]);
    res.json({ ai_until: row.ai_until, ai_active: !!row.ai_active });
  } catch (e) { next(e); }
});

// ---- Push notifications (platform-wide) ----

// Diagnostic: is push configured on the server, and how many devices exist?
router.get('/push-status', async (req, res, next) => {
  try {
    const total = (await one('SELECT COUNT(*) AS c FROM device_tokens'))?.c || 0;
    const android = (await one("SELECT COUNT(*) AS c FROM device_tokens WHERE platform = 'android'"))?.c || 0;
    const ios = (await one("SELECT COUNT(*) AS c FROM device_tokens WHERE platform = 'ios'"))?.c || 0;
    const users = (await one('SELECT COUNT(DISTINCT user_id) AS c FROM device_tokens'))?.c || 0;
    res.json({ configured: pushEnabled(), total, android, ios, users });
  } catch (e) { next(e); }
});

// All registered devices + the user they belong to.
router.get('/devices', async (req, res, next) => {
  try {
    const devices = await q(
      `SELECT dt.token, dt.platform, dt.updated_at, u.id AS user_id, u.name, u.email, o.name AS gym
       FROM device_tokens dt JOIN users u ON u.id = dt.user_id LEFT JOIN organizations o ON o.id = dt.org_id
       ORDER BY dt.updated_at DESC LIMIT 500`
    );
    res.json({ devices });
  } catch (e) { next(e); }
});

// Send a push to everyone / a platform / a single user.
const notifySchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().max(300).optional(),
  audience: z.string().default('all'), // 'all' | 'android' | 'ios' | a numeric userId
});
router.post('/notify', async (req, res, next) => {
  try {
    if (!pushEnabled()) return res.status(503).json({ error: 'Push is not configured on the server (FIREBASE_PROJECT_ID / credentials missing).' });
    const parsed = notifySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const { title, body, audience } = parsed.data;
    let where = '', params = [];
    if (audience === 'android' || audience === 'ios') { where = 'WHERE platform = $1'; params = [audience]; }
    else if (/^\d+$/.test(audience)) { where = 'WHERE user_id = $1'; params = [Number(audience)]; }
    const rows = await q(`SELECT token FROM device_tokens ${where}`, params);
    const result = await sendToTokens(rows.map((r) => r.token), {
      title: `🔔 ${title}`, body: body || '', data: { type: 'alert', screen: 'Home' },
    });
    res.json({ sent: result.sent || 0, targeted: rows.length, error: result.sampleError || null, errors: result.errors || {} });
  } catch (e) { next(e); }
});

// ---- App update management (force / soft update) ----
router.get('/app-update', async (req, res, next) => {
  try {
    const platforms = await q('SELECT * FROM app_update ORDER BY platform');
    res.json({ platforms });
  } catch (e) { next(e); }
});

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  mode: z.enum(['auto', 'soft', 'force', 'off']).optional(),
  latest_version: z.string().max(20).optional(),
  min_version: z.string().max(20).optional(),
  title: z.string().max(120).optional(),
  message: z.string().max(500).optional(),
  button_text: z.string().max(40).optional(),
  download_url: z.string().max(500).optional(),
});

router.put('/app-update/:platform', async (req, res, next) => {
  try {
    const platform = req.params.platform === 'ios' ? 'ios' : 'android';
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const f = { ...parsed.data };
    if ('enabled' in f) f.enabled = f.enabled ? 1 : 0;
    const keys = Object.keys(f);
    if (keys.length) {
      const set = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
      await one(
        `UPDATE app_update SET ${set}, updated_at = now() WHERE platform = $${keys.length + 1} RETURNING platform`,
        [...keys.map((k) => f[k]), platform]
      );
    }
    const row = await one('SELECT * FROM app_update WHERE platform = $1', [platform]);
    res.json({ platform: row });
  } catch (e) { next(e); }
});

export default router;
