import { Router } from 'express';
import { z } from 'zod';
import { one } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { aiRequired } from '../middleware/ai.js';
import { computeTargets } from '../services/nutrition.js';
import { generateDietPlan } from '../services/bedrock.js';
import { buildNormalPlans } from '../services/templates.js';

const router = Router();
router.use(authRequired);

// A user-built (manual) plan — same shape the app renders for AI/ready-made plans.
const planSchema = z.object({
  title: z.string().min(1).max(80),
  summary: z.string().max(300).optional().default(''),
  daily_calories: z.number().min(0).optional(),
  protein_g: z.number().min(0).optional(),
  carbs_g: z.number().min(0).optional(),
  fat_g: z.number().min(0).optional(),
  meals: z.array(z.object({
    name: z.string().min(1).max(60),
    time: z.string().max(10).optional().default(''),
    calories: z.number().min(0).optional().default(0),
    items: z.array(z.string().max(160)).max(30).optional().default([]),
  })).min(1).max(12),
  tips: z.array(z.string().max(200)).max(20).optional().default([]),
});

// Create a manual plan (becomes the current plan).
router.post('/manual', async (req, res, next) => {
  try {
    const parsed = planSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const plan = { ...parsed.data, source: 'manual' };
    const row = await one('INSERT INTO diet_plans (user_id, plan_json) VALUES ($1,$2) RETURNING id', [req.user.id, JSON.stringify(plan)]);
    res.json({ id: row.id, plan });
  } catch (e) { next(e); }
});

// Edit an existing plan the user owns (AI, ready-made or manual).
router.put('/:id', async (req, res, next) => {
  try {
    const parsed = planSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const existing = await one('SELECT id FROM diet_plans WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!existing) return res.status(404).json({ error: 'Plan not found' });
    const plan = { ...parsed.data, source: 'edited' };
    await one('UPDATE diet_plans SET plan_json = $1 WHERE id = $2 RETURNING id', [JSON.stringify(plan), existing.id]);
    res.json({ id: existing.id, plan });
  } catch (e) { next(e); }
});

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
    const plan = await generateDietPlan({ profile, targets, ctx: { userId: req.user.id } });
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
