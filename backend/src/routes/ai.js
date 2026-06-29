// AI usage stats. Each member sees their own token/cost usage; superadmin sees
// the platform-wide breakdown (see /super/ai-usage).
import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { userUsage } from '../services/aiUsage.js';

const router = Router();
router.use(authRequired);

// The logged-in user's own AI usage (totals, per-feature, recent calls).
router.get('/usage', async (req, res, next) => {
  try {
    res.json(await userUsage(req.user.id));
  } catch (e) { next(e); }
});

export default router;
