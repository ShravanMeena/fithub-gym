import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

// Gate: platform super-admin only (the company).
router.use((req, res, next) => {
  const u = db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
  if (!u || u.role !== 'superadmin') return res.status(403).json({ error: 'Platform admin only' });
  next();
});

// Platform-wide stats.
router.get('/stats', (req, res) => {
  const gyms = db.prepare('SELECT COUNT(*) AS c FROM organizations').get().c;
  const users = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role != 'superadmin'").get().c;
  const aiActive = db.prepare("SELECT COUNT(*) AS c FROM users WHERE ai_until IS NOT NULL AND ai_until > datetime('now')").get().c;
  res.json({ gyms, users, aiActive });
});

// All gyms with member counts + active-AI counts.
router.get('/gyms', (req, res) => {
  const gyms = db
    .prepare(
      `SELECT o.id, o.slug, o.name, o.primary_color, o.owner_name, o.contact_email, o.phone, o.created_at,
        (SELECT COUNT(*) FROM users u WHERE u.org_id = o.id) AS members,
        (SELECT COUNT(*) FROM users u WHERE u.org_id = o.id AND u.ai_until > datetime('now')) AS ai_members
       FROM organizations o ORDER BY o.created_at DESC`
    )
    .all();
  res.json({ gyms });
});

// All users (optional ?q search, ?gym slug filter), with gym + AI status.
router.get('/users', (req, res) => {
  const q = `%${(req.query.q || '').toString().toLowerCase()}%`;
  const rows = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.ai_until,
        (u.ai_until IS NOT NULL AND u.ai_until > datetime('now')) AS ai_active,
        o.name AS gym
       FROM users u LEFT JOIN organizations o ON o.id = u.org_id
       WHERE u.role != 'superadmin' AND (lower(u.name) LIKE ? OR lower(u.email) LIKE ? OR lower(o.name) LIKE ?)
       ORDER BY u.created_at DESC LIMIT 300`
    )
    .all(q, q, q);
  res.json({ users: rows });
});

// Grant / extend / revoke AI access for ANY user (this is the company's product).
const grantSchema = z.object({ days: z.number().int().min(0).max(3650) });
router.post('/users/:id/ai-access', (req, res) => {
  const parsed = grantSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'days must be 0–3650' });
  const { days } = parsed.data;
  const u = db.prepare("SELECT id, ai_until FROM users WHERE id = ? AND role != 'superadmin'").get(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });

  if (days === 0) {
    db.prepare('UPDATE users SET ai_until = NULL WHERE id = ?').run(u.id);
  } else {
    const base = u.ai_until && new Date(u.ai_until + 'Z') > new Date() ? `'${u.ai_until}'` : "datetime('now')";
    db.prepare(`UPDATE users SET ai_until = datetime(${base}, '+${days} days') WHERE id = ?`).run(u.id);
  }
  const row = db.prepare("SELECT ai_until, (ai_until IS NOT NULL AND ai_until > datetime('now')) AS ai_active FROM users WHERE id = ?").get(u.id);
  res.json({ ai_until: row.ai_until, ai_active: !!row.ai_active });
});

export default router;
