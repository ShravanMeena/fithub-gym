import { Router } from 'express';
import { z } from 'zod';
import { q, one } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

const schema = z.object({
  title: z.string().min(1).max(80),
  body: z.string().max(200).optional(),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  enabled: z.boolean().default(true),
  tz_offset: z.number().int().min(-720).max(840).optional(), // minutes ahead of UTC
});

router.get('/', async (req, res, next) => {
  try {
    const reminders = await q('SELECT * FROM reminders WHERE user_id = $1 ORDER BY hour, minute', [req.user.id]);
    res.json({ reminders });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const d = parsed.data;
    const reminder = await one(
      'INSERT INTO reminders (user_id, title, body, hour, minute, enabled, tz_offset) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [req.user.id, d.title, d.body ?? null, d.hour, d.minute, d.enabled ? 1 : 0, d.tz_offset ?? 0]
    );
    res.json({ reminder });
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const parsed = schema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const f = { ...parsed.data };
    if ('enabled' in f) f.enabled = f.enabled ? 1 : 0;
    const keys = Object.keys(f);
    if (keys.length) {
      const set = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
      await one(
        `UPDATE reminders SET ${set} WHERE id = $${keys.length + 1} AND user_id = $${keys.length + 2} RETURNING id`,
        [...keys.map((k) => f[k]), req.params.id, req.user.id]
      );
    }
    const reminder = await one('SELECT * FROM reminders WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ reminder });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await one('DELETE FROM reminders WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
