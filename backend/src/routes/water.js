// Daily water tracker — per-user goal + optional hydration reminders.
import { Router } from 'express';
import { one } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

router.get('/', async (req, res, next) => {
  try {
    const row = await one('SELECT glasses FROM water_intake WHERE user_id = $1 AND day = current_date', [req.user.id]);
    const u = await one('SELECT water_goal, water_reminders FROM users WHERE id = $1', [req.user.id]);
    res.json({ glasses: row?.glasses || 0, goal: u?.water_goal || 8, reminders: !!u?.water_reminders });
  } catch (e) { next(e); }
});

// Add/remove a glass: body { delta: 1 | -1 } (default +1). Never below 0.
router.post('/add', async (req, res, next) => {
  try {
    const delta = req.body?.delta === -1 ? -1 : 1;
    const row = await one(
      `INSERT INTO water_intake (user_id, day, glasses) VALUES ($1, current_date, GREATEST(0, $2))
       ON CONFLICT (user_id, day) DO UPDATE SET glasses = GREATEST(0, water_intake.glasses + $2)
       RETURNING glasses`,
      [req.user.id, delta]
    );
    res.json({ glasses: row.glasses });
  } catch (e) { next(e); }
});

// Set the daily goal (glasses).
router.put('/goal', async (req, res, next) => {
  try {
    const goal = Math.max(1, Math.min(30, parseInt(req.body?.goal, 10) || 8));
    await one('UPDATE users SET water_goal = $1 WHERE id = $2 RETURNING id', [goal, req.user.id]);
    res.json({ goal });
  } catch (e) { next(e); }
});

// Toggle hydration reminders.
router.put('/reminders', async (req, res, next) => {
  try {
    const on = req.body?.reminders ? 1 : 0;
    await one('UPDATE users SET water_reminders = $1 WHERE id = $2 RETURNING id', [on, req.user.id]);
    res.json({ reminders: !!on });
  } catch (e) { next(e); }
});

export default router;
