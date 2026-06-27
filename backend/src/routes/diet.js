import { Router } from 'express';
import { one } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { aiRequired } from '../middleware/ai.js';
import { computeTargets } from '../services/nutrition.js';
import { generateDietPlan } from '../services/bedrock.js';
import { buildNormalPlans } from '../services/templates.js';

const router = Router();
router.use(authRequired);

// FREE: ready-made fixed plans. No AI, no subscription.
router.post('/normal', async (req, res, next) => {
  try {
    const profile = await one('SELECT * FROM profiles WHERE user_id = $1', [req.user.id]);
    if (!profile || !profile.age || !profile.weight_kg || !profile.height_cm) {
      return res.status(400).json({ error: 'Complete your profile (age, height, weight) first.' });
    }
    const targets = computeTargets(profile);
    const plan = buildNormalPlans({ profile, targets });
    const row = await one('INSERT INTO diet_plans (user_id, plan_json) VALUES ($1,$2) RETURNING id', [req.user.id, JSON.stringify(plan)]);
    res.json({ id: row.id, plan, targets });
  } catch (e) { next(e); }
});

// PREMIUM (AI): personalized plan. Requires AI subscription.
router.post('/generate', aiRequired, async (req, res, next) => {
  try {
    const profile = await one('SELECT * FROM profiles WHERE user_id = $1', [req.user.id]);
    if (!profile || !profile.age || !profile.weight_kg || !profile.height_cm) {
      return res.status(400).json({ error: 'Complete your profile (age, height, weight) first.' });
    }
    const targets = computeTargets(profile);
    const plan = await generateDietPlan({ profile, targets });
    const row = await one('INSERT INTO diet_plans (user_id, plan_json) VALUES ($1,$2) RETURNING id', [req.user.id, JSON.stringify(plan)]);
    res.json({ id: row.id, plan, targets });
  } catch (err) {
    console.error('diet/generate error:', err);
    res.status(502).json({ error: 'AI diet generation failed. Try again.' });
  }
});

router.get('/current', async (req, res, next) => {
  try {
    const row = await one('SELECT * FROM diet_plans WHERE user_id = $1 ORDER BY id DESC LIMIT 1', [req.user.id]);
    if (!row) return res.json({ plan: null });
    res.json({ id: row.id, plan: JSON.parse(row.plan_json), created_at: row.created_at });
  } catch (e) { next(e); }
});

export default router;
