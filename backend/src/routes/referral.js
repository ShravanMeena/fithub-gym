// Share & earn — the user's referral code, coins, and progress to free Premium.
import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { getReferralInfo } from '../services/referral.js';

const router = Router();
router.use(authRequired);

router.get('/', async (req, res, next) => {
  try {
    res.json(await getReferralInfo(req.user.id));
  } catch (e) { next(e); }
});

export default router;
