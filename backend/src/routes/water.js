// Daily water tracker (free, no AI). One row per user per day.
import { Router } from 'express';
import { one } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);
const GOAL = 8; // glasses/day

router.get('/', async (req, res, next) => {
  try {
    const row = await one('SELECT glasses FROM water_intake WHERE user_id = $1 AND day = current_date', [req.user.id]);
    res.json({ glasses: row?.glasses || 0, goal: GOAL });
  } catch (e) { next(e); }
});

// Add/remove a glass: body { delta: 1 | -1 } (defaults to +1). Never goes below 0.
router.post('/add', async (req, res, next) => {
  try {
    const delta = req.body?.delta === -1 ? -1 : 1;
    const row = await one(
      `INSERT INTO water_intake (user_id, day, glasses) VALUES ($1, current_date, GREATEST(0, $2))
       ON CONFLICT (user_id, day) DO UPDATE SET glasses = GREATEST(0, water_intake.glasses + $2)
       RETURNING glasses`,
      [req.user.id, delta]
    );
    res.json({ glasses: row.glasses, goal: GOAL });
  } catch (e) { next(e); }
});

export default router;
