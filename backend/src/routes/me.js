// "This week" scorecard — the one-glance answer to "am I on track?".
import { Router } from 'express';
import { q, one } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { computeStreaks } from './attendance.js';

const router = Router();
router.use(authRequired);

router.get('/week', async (req, res, next) => {
  try {
    const uid = req.user.id;
    const sessions = (await one(
      `SELECT COUNT(DISTINCT checked_in_at::date) AS c FROM attendance WHERE user_id = $1 AND checked_in_at >= now() - interval '7 days'`,
      [uid]
    ))?.c || 0;
    const foodDays = (await one(
      `SELECT COUNT(DISTINCT eaten_at::date) AS c FROM food_logs WHERE user_id = $1 AND eaten_at >= now() - interval '7 days'`,
      [uid]
    ))?.c || 0;
    const w = await q(
      `SELECT weight_kg FROM progress_logs WHERE user_id = $1 AND weight_kg IS NOT NULL AND logged_at >= now() - interval '35 days' ORDER BY logged_at ASC`,
      [uid]
    );
    const weightChangeKg = w.length >= 2 ? Number(w[w.length - 1].weight_kg) - Number(w[0].weight_kg) : null;

    const ci = await q(`SELECT DISTINCT checked_in_at::date AS d FROM attendance WHERE user_id = $1 AND checked_in_at >= current_date - interval '220 days'`, [uid]);
    const rd = await q(`SELECT day FROM rest_days WHERE user_id = $1 AND day >= current_date - interval '220 days'`, [uid]);
    const { streak } = computeStreaks(new Set(ci.map((r) => r.d)), new Set(rd.map((r) => r.day)));

    res.json({ sessions, foodDays, weightChangeKg, streak, targetSessions: 4 });
  } catch (e) { next(e); }
});

export default router;
