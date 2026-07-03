import { Router } from 'express';
import { z } from 'zod';
import { q, one } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { sendToTokens, pushEnabled } from '../services/push.js';
import { getTrialDays, getSetting, setSetting } from '../services/settings.js';
import { globalUsage } from '../services/aiUsage.js';
import { generateDailyMessage } from '../services/bedrock.js';

const DAILY_FALLBACK = {
  morning: { title: '☀️ Good morning!', body: 'New day, new gains. Plan your gym session and crush it today 💪' },
  evening: { title: '🔥 Evening check-in', body: 'Did you move today? Even a quick session counts — let’s go!' },
  night: { title: '🌙 Good night', body: 'Rest well — your muscles grow while you sleep. See you tomorrow 💪' },
};

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

// ---- API logs console (observability) -------------------------------------

// Quick health numbers for the last 24h + top offenders.
router.get('/logs/stats', async (req, res, next) => {
  try {
    const totals = await one(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE ok = false)::int AS errors,
              COUNT(*) FILTER (WHERE status >= 500)::int AS server_errors,
              COALESCE(ROUND(AVG(duration_ms))::int, 0) AS avg_ms,
              COALESCE(MAX(duration_ms), 0) AS max_ms
       FROM api_logs WHERE ts >= now() - interval '24 hours'`
    );
    const topErrors = await q(
      `SELECT route, COUNT(*)::int AS c, MAX(status) AS status
       FROM api_logs WHERE ok = false AND ts >= now() - interval '24 hours'
       GROUP BY route ORDER BY c DESC LIMIT 6`
    );
    const slowest = await q(
      `SELECT route, ROUND(AVG(duration_ms))::int AS avg_ms, COUNT(*)::int AS c
       FROM api_logs WHERE ts >= now() - interval '24 hours'
       GROUP BY route HAVING COUNT(*) >= 3 ORDER BY avg_ms DESC LIMIT 6`
    );
    // Requests + errors per hour for the last 24h (sparkline).
    const trend = await q(
      `SELECT to_char(h, 'HH24:00') AS hour,
              COALESCE(c.total, 0)::int AS total, COALESCE(c.errors, 0)::int AS errors
       FROM generate_series(date_trunc('hour', now()) - interval '23 hours', date_trunc('hour', now()), interval '1 hour') h
       LEFT JOIN (
         SELECT date_trunc('hour', ts) AS hh, COUNT(*) AS total, COUNT(*) FILTER (WHERE ok = false) AS errors
         FROM api_logs WHERE ts >= now() - interval '24 hours' GROUP BY 1
       ) c ON c.hh = h ORDER BY h`
    );
    res.json({ totals, topErrors, slowest, trend });
  } catch (e) { next(e); }
});

// Paginated, filterable log list (lightweight rows — no headers/bodies).
router.get('/logs', async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const where = [];
    const params = [];
    const add = (clause, val) => { params.push(val); where.push(clause.replace('?', `$${params.length}`)); };

    const scope = req.query.scope;
    if (scope === 'errors') where.push('l.ok = false');
    else if (scope === '5xx') where.push('l.status >= 500');
    else if (scope === '4xx') where.push('l.status >= 400 AND l.status < 500');
    if (req.query.user_id) add('l.user_id = ?', parseInt(req.query.user_id, 10));
    if (req.query.route) add('l.route ILIKE ?', `%${req.query.route}%`);
    if (req.query.q) add('l.path ILIKE ?', `%${req.query.q}%`);
    if (req.query.method) add('l.method = ?', String(req.query.method).toUpperCase());
    if (req.query.before) add('l.id < ?', parseInt(req.query.before, 10)); // cursor

    const sql = `
      SELECT l.id, l.ts, l.method, l.path, l.route, l.status, l.duration_ms, l.ok, l.user_id, l.error,
             u.name AS user_name, u.email AS user_email
      FROM api_logs l LEFT JOIN users u ON u.id = l.user_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY l.id DESC LIMIT ${limit}`;
    const rows = await q(sql, params);
    const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null;
    res.json({ logs: rows, nextCursor });
  } catch (e) { next(e); }
});

// Full detail for one request (headers + bodies).
router.get('/logs/:id', async (req, res, next) => {
  try {
    const row = await one(
      `SELECT l.*, u.name AS user_name, u.email AS user_email
       FROM api_logs l LEFT JOIN users u ON u.id = l.user_id WHERE l.id = $1`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ log: row });
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

// ---- Product analytics (usage dashboard) ----
router.get('/analytics', async (req, res, next) => {
  try {
    const num = async (sql, params = []) => Number((await one(sql, params))?.c || 0);
    const activeIn = (days) => num(`SELECT COUNT(DISTINCT user_id) c FROM analytics_events WHERE event='app_open' AND created_at >= now() - interval '${days} days'`);

    const dau = await num(`SELECT COUNT(DISTINCT user_id) c FROM analytics_events WHERE event='app_open' AND created_at::date = current_date`);
    const wau = await activeIn(7);
    const mau = await activeIn(30);
    const totalUsers = await num(`SELECT COUNT(*) c FROM users WHERE role='member'`);

    const signups = {
      today: await num(`SELECT COUNT(*) c FROM users WHERE created_at::date = current_date`),
      week: await num(`SELECT COUNT(*) c FROM users WHERE created_at >= now() - interval '7 days'`),
      month: await num(`SELECT COUNT(*) c FROM users WHERE created_at >= now() - interval '30 days'`),
    };
    const activity = {
      checkinsToday: await num(`SELECT COUNT(*) c FROM attendance WHERE checked_in_at::date = current_date`),
      checkinsWeek: await num(`SELECT COUNT(*) c FROM attendance WHERE checked_in_at >= now() - interval '7 days'`),
      foodWeek: await num(`SELECT COUNT(*) c FROM food_logs WHERE eaten_at >= now() - interval '7 days'`),
      postsWeek: await num(`SELECT COUNT(*) c FROM posts WHERE created_at >= now() - interval '7 days' AND is_announcement = 0`),
      prsWeek: await num(`SELECT COUNT(*) c FROM personal_records WHERE logged_at >= now() - interval '7 days'`),
    };
    const paywallWeek = await num(`SELECT COUNT(DISTINCT user_id) c FROM analytics_events WHERE event='paywall_shown' AND created_at >= now() - interval '7 days'`);
    const aiActive = await num(`SELECT COUNT(*) c FROM users WHERE ai_until > now()`);

    const adoption = {
      checkedIn: await num(`SELECT COUNT(DISTINCT user_id) c FROM attendance`),
      loggedFood: await num(`SELECT COUNT(DISTINCT user_id) c FROM food_logs`),
      posted: await num(`SELECT COUNT(DISTINCT user_id) c FROM posts`),
      photo: await num(`SELECT COUNT(DISTINCT user_id) c FROM progress_photos`),
      pr: await num(`SELECT COUNT(DISTINCT user_id) c FROM personal_records`),
    };
    const trend = await q(
      `SELECT to_char(d::date,'MM-DD') AS day,
              COALESCE((SELECT COUNT(DISTINCT user_id) FROM analytics_events e WHERE e.event='app_open' AND e.created_at::date = d::date), 0) AS users
       FROM generate_series(current_date - interval '13 days', current_date, interval '1 day') d ORDER BY d`
    );
    res.json({ dau, wau, mau, totalUsers, signups, activity, paywallWeek, aiActive, adoption, trend });
  } catch (e) { next(e); }
});

// ---- AI usage (tokens + cost), platform-wide ----
router.get('/ai-usage', async (req, res, next) => {
  try {
    res.json(await globalUsage());
  } catch (e) { next(e); }
});

// Test a daily AI message now: generate it and (optionally) send to all devices.
router.post('/daily-test', async (req, res, next) => {
  try {
    const slot = ['morning', 'evening', 'night'].includes(req.body?.slot) ? req.body.slot : 'morning';
    const msg = (await generateDailyMessage(slot).catch(() => null)) || DAILY_FALLBACK[slot];
    let sent = 0, targeted = 0;
    if (req.body?.send) {
      const rows = await q('SELECT DISTINCT token FROM device_tokens');
      targeted = rows.length;
      if (rows.length) {
        const r = await sendToTokens(rows.map((x) => x.token), { title: msg.title, body: msg.body, data: { type: 'daily', screen: 'Today' } });
        sent = r.sent;
      }
    }
    res.json({ slot, message: msg, ai: msg !== DAILY_FALLBACK[slot], sent, targeted });
  } catch (e) { next(e); }
});

// ---- Platform settings (free trial, etc.) ----
router.get('/settings', async (req, res, next) => {
  try {
    res.json({
      trial_days: await getTrialDays(),
      daily_messages: (await getSetting('daily_messages', 'on')) !== 'off',
    });
  } catch (e) { next(e); }
});

router.put('/settings', async (req, res, next) => {
  try {
    if (req.body?.trial_days !== undefined) {
      const d = Number(req.body.trial_days);
      if (!Number.isInteger(d) || d < 0 || d > 3650) return res.status(400).json({ error: 'trial_days must be 0–3650' });
      await setSetting('trial_days', d);
    }
    if (req.body?.daily_messages !== undefined) {
      await setSetting('daily_messages', req.body.daily_messages ? 'on' : 'off');
    }
    res.json({
      trial_days: await getTrialDays(),
      daily_messages: (await getSetting('daily_messages', 'on')) !== 'off',
    });
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
  force_versions: z.string().max(500).optional(),
  soft_versions: z.string().max(500).optional(),
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
