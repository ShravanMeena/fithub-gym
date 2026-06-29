import { Router } from 'express';
import { z } from 'zod';
import { q, one } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { aiRequired } from '../middleware/ai.js';
import { computeTargets } from '../services/nutrition.js';
import { coachAdvice } from '../services/bedrock.js';

const router = Router();
router.use(authRequired);

const entrySchema = z.object({
  weight_kg: z.number().min(25).max(300).optional(),
  body_fat: z.number().min(2).max(70).optional(),
  waist_cm: z.number().min(30).max(250).optional(),
  chest_cm: z.number().min(30).max(250).optional(),
  arms_cm: z.number().min(10).max(100).optional(),
  note: z.string().max(300).optional(),
});

router.post('/', async (req, res, next) => {
  try {
    const parsed = entrySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const d = parsed.data;
    const row = await one(
      `INSERT INTO progress_logs (user_id, weight_kg, body_fat, waist_cm, chest_cm, arms_cm, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [req.user.id, d.weight_kg ?? null, d.body_fat ?? null, d.waist_cm ?? null, d.chest_cm ?? null, d.arms_cm ?? null, d.note ?? null]
    );
    res.json({ id: row.id });
  } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try {
    const entries = await q('SELECT * FROM progress_logs WHERE user_id = $1 ORDER BY logged_at ASC', [req.user.id]);
    res.json({ entries });
  } catch (e) { next(e); }
});

router.post('/coach', aiRequired, async (req, res) => {
  try {
    const profile = (await one('SELECT * FROM profiles WHERE user_id = $1', [req.user.id])) || {};
    const targets = computeTargets(profile);
    const progress = await q('SELECT * FROM progress_logs WHERE user_id = $1 ORDER BY logged_at DESC LIMIT 14', [req.user.id]);
    const recentNutrition = await q(
      'SELECT name, calories, protein_g, carbs_g, fat_g, eaten_at FROM food_logs WHERE user_id = $1 ORDER BY eaten_at DESC LIMIT 12',
      [req.user.id]
    );
    const advice = await coachAdvice({ profile, targets, progress, recentNutrition, question: req.body?.question, ctx: { userId: req.user.id } });
    res.json({ advice });
  } catch (err) {
    console.error('progress/coach error:', err);
    res.status(502).json({ error: 'AI coaching failed. Try again.' });
  }
});

export default router;
