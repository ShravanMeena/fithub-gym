import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

// Gate: must be an admin.
router.use((req, res, next) => {
  const u = db.prepare('SELECT role, org_id FROM users WHERE id = ?').get(req.user.id);
  if (!u || u.role !== 'admin') return res.status(403).json({ error: 'Admin access only' });
  req.orgId = u.org_id;
  next();
});

// Gym overview + admin's own org.
router.get('/overview', (req, res) => {
  const org = db.prepare('SELECT id, slug, name, tagline, primary_color, owner_name, contact_email, phone FROM organizations WHERE id = ?').get(req.orgId);
  const memberCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE org_id = ?").get(req.orgId)?.c || 0;
  const inGymNow = db
    .prepare('SELECT COUNT(DISTINCT user_id) AS c FROM attendance WHERE org_id = ? AND checked_out_at IS NULL')
    .get(req.orgId)?.c || 0;
  const todayCount = db
    .prepare("SELECT COUNT(DISTINCT user_id) AS c FROM attendance WHERE org_id = ? AND date(checked_in_at)=date('now','localtime')")
    .get(req.orgId)?.c || 0;
  res.json({ org, stats: { memberCount, inGymNow, todayCount } });
});

// All members with attendance summary.
router.get('/members', (req, res) => {
  const members = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.created_at,
        (SELECT COUNT(*) FROM attendance a WHERE a.user_id = u.id) AS visits,
        (SELECT MAX(checked_in_at) FROM attendance a WHERE a.user_id = u.id) AS last_visit,
        (SELECT 1 FROM attendance a WHERE a.user_id = u.id AND a.checked_out_at IS NULL LIMIT 1) AS in_gym,
        (SELECT ROUND(AVG((julianday(checked_out_at)-julianday(checked_in_at))*1440))
           FROM attendance a WHERE a.user_id = u.id AND a.checked_out_at IS NOT NULL) AS avg_minutes,
        u.ai_until,
        (u.ai_until IS NOT NULL AND u.ai_until > datetime('now')) AS ai_active
       FROM users u WHERE u.org_id = ? ORDER BY u.created_at DESC`
    )
    .all(req.orgId);
  res.json({ members });
});

// Recent attendance log across the gym (with durations).
router.get('/attendance', (req, res) => {
  const rows = db
    .prepare(
      `SELECT a.id, u.name, a.checked_in_at, a.checked_out_at, a.reason,
        CASE WHEN a.checked_out_at IS NOT NULL
          THEN ROUND((julianday(a.checked_out_at)-julianday(a.checked_in_at))*1440) END AS minutes
       FROM attendance a JOIN users u ON u.id = a.user_id
       WHERE a.org_id = ? ORDER BY a.checked_in_at DESC LIMIT 100`
    )
    .all(req.orgId);
  res.json({ attendance: rows });
});

// Post an announcement / promotion to the gym's community feed.
router.post('/announce', (req, res) => {
  const content = (req.body?.content || '').toString().trim();
  if (content.length < 1) return res.status(400).json({ error: 'Write something to announce.' });
  const info = db
    .prepare("INSERT INTO posts (user_id, org_id, type, content, is_announcement) VALUES (?, ?, 'text', ?, 1)")
    .run(req.user.id, req.orgId, content.slice(0, 2000));
  res.json({ id: info.lastInsertRowid });
});

// Remove a member from the gym (deletes their account + data). Cannot remove self or another admin.
router.delete('/members/:id', (req, res) => {
  const m = db.prepare('SELECT id, role FROM users WHERE id = ? AND org_id = ?').get(req.params.id, req.orgId);
  if (!m) return res.status(404).json({ error: 'Member not found in your gym' });
  if (m.id === req.user.id) return res.status(400).json({ error: "You can't remove yourself." });
  if (m.role === 'admin') return res.status(400).json({ error: "You can't remove another admin." });
  db.prepare('DELETE FROM users WHERE id = ?').run(m.id); // cascades to their data
  res.json({ ok: true });
});

// Create a home-screen notice for the gym.
const noticeSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().max(500).optional(),
  type: z.enum(['info', 'ack', 'yesno']).default('info'),
});
router.post('/notices', (req, res) => {
  const parsed = noticeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;
  const info = db
    .prepare('INSERT INTO notices (org_id, title, body, type) VALUES (?, ?, ?, ?)')
    .run(req.orgId, d.title.trim(), d.body?.trim() || null, d.type);
  res.json({ id: info.lastInsertRowid });
});

// List notices with response stats.
router.get('/notices', (req, res) => {
  const total = db.prepare("SELECT COUNT(*) AS c FROM users WHERE org_id = ? AND role = 'member'").get(req.orgId)?.c || 0;
  const notices = db
    .prepare(
      `SELECT n.*,
        (SELECT COUNT(*) FROM notice_responses r WHERE r.notice_id = n.id AND r.seen_at IS NOT NULL) AS seen,
        (SELECT COUNT(*) FROM notice_responses r WHERE r.notice_id = n.id AND r.response = 'yes') AS yes,
        (SELECT COUNT(*) FROM notice_responses r WHERE r.notice_id = n.id AND r.response = 'no') AS no,
        (SELECT COUNT(*) FROM notice_responses r WHERE r.notice_id = n.id AND r.response = 'ack') AS ack
       FROM notices n WHERE n.org_id = ? ORDER BY n.created_at DESC`
    )
    .all(req.orgId);
  res.json({ notices, totalMembers: total });
});

router.delete('/notices/:id', (req, res) => {
  db.prepare('UPDATE notices SET active = 0 WHERE id = ? AND org_id = ?').run(req.params.id, req.orgId);
  res.json({ ok: true });
});

// Update gym branding/details.
const orgSchema = z.object({
  name: z.string().min(2).max(60).optional(),
  tagline: z.string().max(120).optional(),
  primary_color: z.string().regex(/^#?[0-9a-fA-F]{6}$/).optional(),
  phone: z.string().max(20).optional(),
});
router.put('/org', (req, res) => {
  const parsed = orgSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const f = { ...parsed.data };
  if (f.primary_color && !f.primary_color.startsWith('#')) f.primary_color = `#${f.primary_color}`;
  const keys = Object.keys(f);
  if (keys.length) {
    db.prepare(`UPDATE organizations SET ${keys.map((k) => `${k}=@${k}`).join(', ')} WHERE id=@id`).run({ ...f, id: req.orgId });
  }
  res.json({ org: db.prepare('SELECT id, slug, name, tagline, primary_color, phone FROM organizations WHERE id = ?').get(req.orgId) });
});

// Update admin account (name / email / password).
const acctSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).max(100).optional(),
});
router.put('/account', (req, res) => {
  const parsed = acctSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const f = parsed.data;
  if (f.email) {
    const taken = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(f.email.toLowerCase(), req.user.id);
    if (taken) return res.status(409).json({ error: 'Email already in use' });
  }
  const sets = [];
  const params = { id: req.user.id };
  if (f.name) { sets.push('name=@name'); params.name = f.name; }
  if (f.email) { sets.push('email=@email'); params.email = f.email.toLowerCase(); }
  if (f.password) { sets.push('password_hash=@ph'); params.ph = bcrypt.hashSync(f.password, 10); }
  if (sets.length) db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id=@id`).run(params);
  res.json({ ok: true });
});

export default router;
