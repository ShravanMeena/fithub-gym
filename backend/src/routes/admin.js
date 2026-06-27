import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { q, one } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';

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
        (u.ai_until IS NOT NULL AND u.ai_until > now()) AS ai_active
       FROM users u WHERE u.org_id = $1 ORDER BY u.created_at DESC`,
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
    res.json({ id: row.id });
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
