import { Router } from 'express';
import { z } from 'zod';
import { q, one } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';

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

export default router;
