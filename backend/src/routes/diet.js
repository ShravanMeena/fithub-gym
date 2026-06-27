import { Router } from 'express';
import { db } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { aiRequired } from '../middleware/ai.js';
import { computeTargets } from '../services/nutrition.js';
import { generateDietPlan } from '../services/bedrock.js';
import { buildNormalPlans } from '../services/templates.js';

const router = Router();
router.use(authRequired);

// FREE: ready-made fixed plans based on the user's goal/targets. No AI, no subscription.
router.post('/normal', (req, res) => {
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.user.id);
  if (!profile || !profile.age || !profile.weight_kg || !profile.height_cm) {
    return res.status(400).json({ error: 'Complete your profile (age, height, weight) first.' });
  }
  const targets = computeTargets(profile);
  const plan = buildNormalPlans({ profile, targets });
  const info = db.prepare('INSERT INTO diet_plans (user_id, plan_json) VALUES (?, ?)').run(req.user.id, JSON.stringify(plan));
  res.json({ id: info.lastInsertRowid, plan, targets });
});

// PREMIUM (AI): generate a personalized plan. Requires an active AI subscription.
router.post('/generate', aiRequired, async (req, res) => {
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.user.id);
  if (!profile || !profile.age || !profile.weight_kg || !profile.height_cm) {
    return res.status(400).json({ error: 'Complete your profile (age, height, weight) first.' });
  }
  const targets = computeTargets(profile);
  try {
    const plan = await generateDietPlan({ profile, targets });
    const info = db
      .prepare('INSERT INTO diet_plans (user_id, plan_json) VALUES (?, ?)')
      .run(req.user.id, JSON.stringify(plan));
    res.json({ id: info.lastInsertRowid, plan, targets });
  } catch (err) {
    console.error('diet/generate error:', err);
    res.status(502).json({ error: 'AI diet generation failed. Try again.' });
  }
});

// Latest saved plan.
router.get('/current', (req, res) => {
  const row = db
    .prepare('SELECT * FROM diet_plans WHERE user_id = ? ORDER BY id DESC LIMIT 1')
    .get(req.user.id);
  if (!row) return res.json({ plan: null });
  res.json({ id: row.id, plan: JSON.parse(row.plan_json), created_at: row.created_at });
});

export default router;
