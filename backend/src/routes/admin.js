import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { q, one } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { sendToOrg, sendToTokens, sendToUser, pushEnabled } from '../services/push.js';

// Fire-and-forget push to all members of a gym (never blocks the response).
function pushToOrg(orgId, excludeUserId, payload) {
  sendToOrg(orgId, payload, { excludeUserId }).catch((e) =>
    console.log('[push] org notify failed —', e.message)
  );
}

const router = Router();
router.use(authRequired);

// Gate: must be a gym admin.
router.use(async (req, res, next) => {
  try {
    const u = await one('SELECT role, org_id FROM users WHERE id = $1', [req.user.id]);
    if (!u || u.role !== 'admin') return res.status(403).json({ error: 'Admin access only' });
    req.orgId = u.org_id;
    next();
  } catch (e) { next(e); }
});

router.get('/overview', async (req, res, next) => {
  try {
    const org = await one('SELECT id, slug, name, tagline, primary_color, owner_name, contact_email, phone FROM organizations WHERE id = $1', [req.orgId]);
    const memberCount = (await one('SELECT COUNT(*) AS c FROM users WHERE org_id = $1', [req.orgId]))?.c || 0;
    const inGymNow = (await one('SELECT COUNT(DISTINCT user_id) AS c FROM attendance WHERE org_id = $1 AND checked_out_at IS NULL', [req.orgId]))?.c || 0;
    const todayCount = (await one(`SELECT COUNT(DISTINCT user_id) AS c FROM attendance WHERE org_id = $1 AND checked_in_at::date = current_date`, [req.orgId]))?.c || 0;
    res.json({ org, stats: { memberCount, inGymNow, todayCount } });
  } catch (e) { next(e); }
});

router.get('/members', async (req, res, next) => {
  try {
    const members = await q(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.created_at,
        (SELECT COUNT(*) FROM attendance a WHERE a.user_id = u.id) AS visits,
        (SELECT MAX(checked_in_at) FROM attendance a WHERE a.user_id = u.id) AS last_visit,
        (SELECT 1 FROM attendance a WHERE a.user_id = u.id AND a.checked_out_at IS NULL LIMIT 1) AS in_gym,
        (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (checked_out_at - checked_in_at))/60))
           FROM attendance a WHERE a.user_id = u.id AND a.checked_out_at IS NOT NULL) AS avg_minutes,
        u.ai_until,
        (u.ai_until IS NOT NULL AND u.ai_until > now()) AS ai_active,
        mi.paid_until, mi.fee_amount,
        CASE WHEN mi.paid_until IS NULL THEN 'none'
             WHEN mi.paid_until >= current_date THEN 'active' ELSE 'expired' END AS fee_status
       FROM users u LEFT JOIN member_info mi ON mi.user_id = u.id
       WHERE u.org_id = $1 ORDER BY u.created_at DESC`,
      [req.orgId]
    );
    res.json({ members });
  } catch (e) { next(e); }
});

router.get('/attendance', async (req, res, next) => {
  try {
    const attendance = await q(
      `SELECT a.id, u.name, a.checked_in_at, a.checked_out_at, a.reason,
        CASE WHEN a.checked_out_at IS NOT NULL
          THEN ROUND(EXTRACT(EPOCH FROM (a.checked_out_at - a.checked_in_at))/60)::int END AS minutes
       FROM attendance a JOIN users u ON u.id = a.user_id
       WHERE a.org_id = $1 ORDER BY a.checked_in_at DESC LIMIT 100`,
      [req.orgId]
    );
    res.json({ attendance });
  } catch (e) { next(e); }
});

// Announcement -> pinned feed post.
router.post('/announce', async (req, res, next) => {
  try {
    const content = (req.body?.content || '').toString().trim();
    if (content.length < 1) return res.status(400).json({ error: 'Write something to announce.' });
    const row = await one(
      "INSERT INTO posts (user_id, org_id, type, content, is_announcement) VALUES ($1,$2,'text',$3,1) RETURNING id",
      [req.user.id, req.orgId, content.slice(0, 2000)]
    );
    const org = await one('SELECT name FROM organizations WHERE id = $1', [req.orgId]);
    pushToOrg(req.orgId, req.user.id, {
      title: `📢 ${org?.name || 'Your gym'}`,
      body: content.slice(0, 180),
      data: { type: 'announcement', postId: row.id, screen: 'Feed' },
    });
    res.json({ id: row.id });
  } catch (e) { next(e); }
});

// Live push — blast an instant notification to every member's phone. No feed
// post, no home banner; purely a push (e.g. "Gym closed today due to rain").
// Awaits the send so the panel can report how many devices got it.
router.post('/push', async (req, res, next) => {
  try {
    const title = (req.body?.title || '').toString().trim();
    const body = (req.body?.body || '').toString().trim();
    if (!title) return res.status(400).json({ error: 'Add a title.' });
    if (!pushEnabled()) {
      return res.status(503).json({ error: 'Push is not configured on the server yet.', configured: false });
    }
    const org = await one('SELECT name FROM organizations WHERE id = $1', [req.orgId]);
    const result = await sendToOrg(
      req.orgId,
      {
        title: `🔔 ${title}`,
        body: body || (org?.name ? `From ${org.name}` : 'Tap to open'),
        data: { type: 'alert', screen: 'Home' },
      },
      { excludeUserId: req.user.id }
    );
    res.json({ sent: result.sent || 0, configured: true });
  } catch (e) { next(e); }
});

// Members who haven't checked in for `days` days (default 14) — win-back list.
router.get('/inactive', async (req, res, next) => {
  try {
    const days = Math.min(180, Math.max(1, parseInt(req.query.days, 10) || 14));
    const members = await q(
      `SELECT u.id, u.name, u.email, u.phone,
              (SELECT MAX(checked_in_at) FROM attendance a WHERE a.user_id = u.id) AS last_visit,
              EXISTS (SELECT 1 FROM device_tokens dt WHERE dt.user_id = u.id) AS reachable
       FROM users u
       WHERE u.org_id = $1 AND u.role = 'member'
         AND NOT EXISTS (
           SELECT 1 FROM attendance a
           WHERE a.user_id = u.id AND a.checked_in_at >= current_date - make_interval(days => $2)
         )
       ORDER BY last_visit ASC NULLS FIRST`,
      [req.orgId, days]
    );
    res.json({ days, members });
  } catch (e) { next(e); }
});

// Push a "we miss you" nudge to every inactive member's devices.
router.post('/nudge-inactive', async (req, res, next) => {
  try {
    if (!pushEnabled()) return res.status(503).json({ error: 'Push is not configured on the server yet.' });
    const days = Math.min(180, Math.max(1, parseInt(req.body?.days, 10) || 14));
    const title = (req.body?.title || '').toString().trim();
    const body = (req.body?.body || '').toString().trim();
    const org = await one('SELECT name FROM organizations WHERE id = $1', [req.orgId]);
    const rows = await q(
      `SELECT DISTINCT dt.token
       FROM device_tokens dt JOIN users u ON u.id = dt.user_id
       WHERE u.org_id = $1 AND u.role = 'member'
         AND NOT EXISTS (
           SELECT 1 FROM attendance a
           WHERE a.user_id = u.id AND a.checked_in_at >= current_date - make_interval(days => $2)
         )`,
      [req.orgId, days]
    );
    const result = await sendToTokens(rows.map((r) => r.token), {
      title: title || `We miss you at ${org?.name || 'the gym'}! 💪`,
      body: body || 'It’s been a while — come crush a workout today.',
      data: { type: 'alert', screen: 'Home' },
    });
    res.json({ sent: result.sent || 0 });
  } catch (e) { next(e); }
});

// Full member detail — profile, attendance, fees/membership, notes.
router.get('/members/:id', async (req, res, next) => {
  try {
    const u = await one(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.created_at, u.ai_until,
              (u.ai_until IS NOT NULL AND u.ai_until > now()) AS ai_active
       FROM users u WHERE u.id = $1 AND u.org_id = $2`,
      [req.params.id, req.orgId]
    );
    if (!u) return res.status(404).json({ error: 'Member not found in your gym' });
    const profile = await one('SELECT gender, age, height_cm, weight_kg, target_weight_kg, goal, activity_level, diet_pref FROM profiles WHERE user_id = $1', [u.id]);
    const info = await one('SELECT fee_amount, plan, paid_until, notes FROM member_info WHERE user_id = $1', [u.id]);
    const att = await one(
      `SELECT COUNT(*) AS visits, MAX(checked_in_at) AS last_visit,
              COUNT(*) FILTER (WHERE checked_in_at >= now() - interval '30 days') AS visits_30d,
              ROUND(AVG(EXTRACT(EPOCH FROM (checked_out_at - checked_in_at))/60)) FILTER (WHERE checked_out_at IS NOT NULL) AS avg_minutes
       FROM attendance WHERE user_id = $1`, [u.id]);
    const recent = await q(
      `SELECT checked_in_at, checked_out_at FROM attendance WHERE user_id = $1 ORDER BY checked_in_at DESC LIMIT 8`, [u.id]);
    res.json({ member: u, profile: profile || {}, info: info || {}, attendance: { ...att, recent } });
  } catch (e) { next(e); }
});

// Update a member's fees / membership / notes.
const infoSchema = z.object({
  fee_amount: z.number().min(0).max(1000000).nullable().optional(),
  plan: z.string().max(40).optional(),
  paid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().max(1000).optional(),
});
router.put('/members/:id/info', async (req, res, next) => {
  try {
    const m = await one('SELECT id FROM users WHERE id = $1 AND org_id = $2', [req.params.id, req.orgId]);
    if (!m) return res.status(404).json({ error: 'Member not found in your gym' });
    const parsed = infoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const d = parsed.data;
    await one(
      `INSERT INTO member_info (user_id, fee_amount, plan, paid_until, notes, updated_at)
       VALUES ($1,$2,$3,$4,$5, now())
       ON CONFLICT (user_id) DO UPDATE SET
         fee_amount = COALESCE(EXCLUDED.fee_amount, member_info.fee_amount),
         plan = COALESCE(EXCLUDED.plan, member_info.plan),
         paid_until = EXCLUDED.paid_until,
         notes = COALESCE(EXCLUDED.notes, member_info.notes),
         updated_at = now()
       RETURNING user_id`,
      [m.id, d.fee_amount ?? null, d.plan ?? null, d.paid_until ?? null, d.notes ?? null]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Send a custom alert (push) to a single member.
router.post('/members/:id/alert', async (req, res, next) => {
  try {
    const m = await one('SELECT id FROM users WHERE id = $1 AND org_id = $2', [req.params.id, req.orgId]);
    if (!m) return res.status(404).json({ error: 'Member not found in your gym' });
    if (!pushEnabled()) return res.status(503).json({ error: 'Push is not configured on the server yet.' });
    const title = (req.body?.title || '').toString().trim();
    const body = (req.body?.body || '').toString().trim();
    if (!title) return res.status(400).json({ error: 'Add a title.' });
    const org = await one('SELECT name FROM organizations WHERE id = $1', [req.orgId]);
    const result = await sendToUser(m.id, {
      title: `🔔 ${title}`,
      body: body || (org?.name ? `From ${org.name}` : 'Tap to open'),
      data: { type: 'alert', screen: 'Home' },
    });
    res.json({ sent: result.sent || 0 });
  } catch (e) { next(e); }
});

router.delete('/members/:id', async (req, res, next) => {
  try {
    const m = await one('SELECT id, role FROM users WHERE id = $1 AND org_id = $2', [req.params.id, req.orgId]);
    if (!m) return res.status(404).json({ error: 'Member not found in your gym' });
    if (m.id === req.user.id) return res.status(400).json({ error: "You can't remove yourself." });
    if (m.role === 'admin') return res.status(400).json({ error: "You can't remove another admin." });
    await one('DELETE FROM users WHERE id = $1 RETURNING id', [m.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Home-screen notices.
const noticeSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().max(500).optional(),
  type: z.enum(['info', 'ack', 'yesno']).default('info'),
});
router.post('/notices', async (req, res, next) => {
  try {
    const parsed = noticeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const d = parsed.data;
    const row = await one('INSERT INTO notices (org_id, title, body, type) VALUES ($1,$2,$3,$4) RETURNING id', [req.orgId, d.title.trim(), d.body?.trim() || null, d.type]);
    pushToOrg(req.orgId, req.user.id, {
      title: d.title.trim(),
      body: (d.body?.trim() || 'Tap to view').slice(0, 180),
      data: { type: 'notice', noticeId: row.id, screen: 'Home' },
    });
    res.json({ id: row.id });
  } catch (e) { next(e); }
});

router.get('/notices', async (req, res, next) => {
  try {
    const total = (await one("SELECT COUNT(*) AS c FROM users WHERE org_id = $1 AND role = 'member'", [req.orgId]))?.c || 0;
    const notices = await q(
      `SELECT n.*,
        (SELECT COUNT(*) FROM notice_responses r WHERE r.notice_id = n.id AND r.seen_at IS NOT NULL) AS seen,
        (SELECT COUNT(*) FROM notice_responses r WHERE r.notice_id = n.id AND r.response = 'yes') AS yes,
        (SELECT COUNT(*) FROM notice_responses r WHERE r.notice_id = n.id AND r.response = 'no') AS no,
        (SELECT COUNT(*) FROM notice_responses r WHERE r.notice_id = n.id AND r.response = 'ack') AS ack
       FROM notices n WHERE n.org_id = $1 ORDER BY n.created_at DESC`,
      [req.orgId]
    );
    res.json({ notices, totalMembers: total });
  } catch (e) { next(e); }
});

router.delete('/notices/:id', async (req, res, next) => {
  try {
    await one('UPDATE notices SET active = 0 WHERE id = $1 AND org_id = $2 RETURNING id', [req.params.id, req.orgId]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Update gym.
const orgSchema = z.object({
  name: z.string().min(2).max(60).optional(),
  tagline: z.string().max(120).optional(),
  primary_color: z.string().regex(/^#?[0-9a-fA-F]{6}$/).optional(),
  phone: z.string().max(20).optional(),
});
router.put('/org', async (req, res, next) => {
  try {
    const parsed = orgSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const f = { ...parsed.data };
    if (f.primary_color && !f.primary_color.startsWith('#')) f.primary_color = `#${f.primary_color}`;
    const keys = Object.keys(f);
    if (keys.length) {
      const set = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
      await one(`UPDATE organizations SET ${set} WHERE id = $${keys.length + 1} RETURNING id`, [...keys.map((k) => f[k]), req.orgId]);
    }
    res.json({ org: await one('SELECT id, slug, name, tagline, primary_color, phone FROM organizations WHERE id = $1', [req.orgId]) });
  } catch (e) { next(e); }
});

// Update admin account.
const acctSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).max(100).optional(),
});
router.put('/account', async (req, res, next) => {
  try {
    const parsed = acctSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const f = parsed.data;
    if (f.email && (await one('SELECT id FROM users WHERE email = $1 AND id != $2', [f.email.toLowerCase(), req.user.id]))) {
      return res.status(409).json({ error: 'Email already in use' });
    }
    const sets = [], vals = [];
    if (f.name) { vals.push(f.name); sets.push(`name = $${vals.length}`); }
    if (f.email) { vals.push(f.email.toLowerCase()); sets.push(`email = $${vals.length}`); }
    if (f.password) { vals.push(bcrypt.hashSync(f.password, 10)); sets.push(`password_hash = $${vals.length}`); }
    if (sets.length) { vals.push(req.user.id); await one(`UPDATE users SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING id`, vals); }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
