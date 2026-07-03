// Personal records — quick PR tracking for the big lifts (no full workout logging).
import { Router } from 'express';
import { z } from 'zod';
import { q, one } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

const schema = z.object({
  lift: z.string().min(1).max(40),
  weight_kg: z.number().min(1).max(1000),
  reps: z.number().int().min(1).max(100).default(1),
});

router.post('/', async (req, res, next) => {
  try {
    const p = schema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
    const d = p.data;
    const row = await one(
      'INSERT INTO personal_records (user_id, lift, weight_kg, reps) VALUES ($1,$2,$3,$4) RETURNING id',
      [req.user.id, d.lift.trim(), d.weight_kg, d.reps]
    );
    // Is this a new best for the lift?
    const best = await one('SELECT MAX(weight_kg) AS m FROM personal_records WHERE user_id = $1 AND lower(lift) = lower($2)', [req.user.id, d.lift.trim()]);
    res.json({ id: row.id, isBest: !best || d.weight_kg >= (best.m || 0) });
  } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try {
    const rows = await q('SELECT * FROM personal_records WHERE user_id = $1 ORDER BY logged_at DESC', [req.user.id]);
    const best = {};
    for (const r of rows) {
      const k = r.lift.toLowerCase();
      if (!best[k] || r.weight_kg > best[k].weight_kg) best[k] = r;
    }
    res.json({ records: rows, best: Object.values(best) });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await one('DELETE FROM personal_records WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
