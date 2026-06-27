import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { computeTargets } from '../services/nutrition.js';
import { coachAdvice } from '../services/bedrock.js';
import { aiRequired } from '../middleware/ai.js';

const router = Router();
router.use(authRequired);

const entrySchema = z.object({
  weight_kg: z.number().min(25).max(300).optional(),
  body_fat: z.number().min(2).max(70).optional(),
  note: z.string().max(300).optional(),
});

router.post('/', (req, res) => {
  const parsed = entrySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const d = parsed.data;
  const info = db
    .prepare('INSERT INTO progress_logs (user_id, weight_kg, body_fat, note) VALUES (?, ?, ?, ?)')
    .run(req.user.id, d.weight_kg ?? null, d.body_fat ?? null, d.note ?? null);
  res.json({ id: info.lastInsertRowid });
});

router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM progress_logs WHERE user_id = ? ORDER BY logged_at ASC')
    .all(req.user.id);
  res.json({ entries: rows });
});

// AI coaching based on profile + recent progress + recent meals.
router.post('/coach', aiRequired, async (req, res) => {
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.user.id) || {};
  const targets = computeTargets(profile);
  const progress = db
    .prepare('SELECT * FROM progress_logs WHERE user_id = ? ORDER BY logged_at DESC LIMIT 14')
    .all(req.user.id);
  const recentNutrition = db
    .prepare('SELECT name, calories, protein_g, carbs_g, fat_g, eaten_at FROM food_logs WHERE user_id = ? ORDER BY eaten_at DESC LIMIT 12')
    .all(req.user.id);
  try {
    const advice = await coachAdvice({
      profile,
      targets,
      progress,
      recentNutrition,
      question: req.body?.question,
    });
    res.json({ advice });
  } catch (err) {
    console.error('progress/coach error:', err);
    res.status(502).json({ error: 'AI coaching failed. Try again.' });
  }
});

export default router;
