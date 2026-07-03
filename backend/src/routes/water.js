// Daily water tracker — tracked in millilitres, with a per-user goal (default 3L).
import { Router } from 'express';
import { one } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

router.get('/', async (req, res, next) => {
  try {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : null;
    const row = await one('SELECT ml FROM water_intake WHERE user_id = $1 AND day = COALESCE($2::date, current_date)', [req.user.id, date]);
    const u = await one('SELECT water_goal_ml FROM users WHERE id = $1', [req.user.id]);
    res.json({ ml: row?.ml || 0, goalMl: u?.water_goal_ml || 3000 });
  } catch (e) { next(e); }
});

// Last 7 days of water (for the history strip). Fills missing days with 0.
router.get('/history', async (req, res, next) => {
  try {
    const u = await one('SELECT water_goal_ml FROM users WHERE id = $1', [req.user.id]);
    const rows = await q(
      `SELECT to_char(d::date,'YYYY-MM-DD') AS day,
              COALESCE((SELECT ml FROM water_intake w WHERE w.user_id = $1 AND w.day = d::date), 0) AS ml
       FROM generate_series(current_date - interval '6 days', current_date, interval '1 day') d
       ORDER BY d`,
      [req.user.id]
    );
    res.json({ days: rows, goalMl: u?.water_goal_ml || 3000 });
  } catch (e) { next(e); }
});

// Add/remove water: body { ml } (e.g. 250, 500, 1000, or negative to undo). Never below 0.
router.post('/add', async (req, res, next) => {
  try {
    const delta = Math.trunc(Number(req.body?.ml) || 0);
    if (!delta) return res.status(400).json({ error: 'ml is required' });
    const clamped = Math.max(-5000, Math.min(5000, delta));
    const row = await one(
      `INSERT INTO water_intake (user_id, day, ml) VALUES ($1, current_date, GREATEST(0, $2))
       ON CONFLICT (user_id, day) DO UPDATE SET ml = GREATEST(0, water_intake.ml + $2)
       RETURNING ml`,
      [req.user.id, clamped]
    );
    res.json({ ml: row.ml });
  } catch (e) { next(e); }
});

// Set the daily goal in millilitres (1000–6000).
router.put('/goal', async (req, res, next) => {
  try {
    const goalMl = Math.max(1000, Math.min(6000, Math.trunc(Number(req.body?.goalMl) || 3000)));
    await one('UPDATE users SET water_goal_ml = $1 WHERE id = $2 RETURNING id', [goalMl, req.user.id]);
    res.json({ goalMl });
  } catch (e) { next(e); }
});

export default router;
