import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { computeTargets } from '../services/nutrition.js';

const router = Router();
router.use(authRequired);

const profileSchema = z.object({
  gender: z.enum(['male', 'female', 'other']).optional(),
  age: z.number().int().min(10).max(100).optional(),
  height_cm: z.number().min(80).max(250).optional(),
  weight_kg: z.number().min(25).max(300).optional(),
  goal: z.enum(['lose_fat', 'build_muscle', 'gain_weight', 'maintain', 'recomp']).optional(),
  activity_level: z
    .enum(['sedentary', 'light', 'moderate', 'active', 'very_active'])
    .optional(),
  diet_pref: z.enum(['veg', 'nonveg', 'vegan', 'eggetarian']).optional(),
  allergies: z.string().max(300).optional(),
  target_weight_kg: z.number().min(25).max(300).optional(),
  wake_time: z.string().max(5).optional(),   // "HH:MM"
  sleep_time: z.string().max(5).optional(),  // "HH:MM"
  gym_time: z.string().max(20).optional(),   // "morning" | "evening" | "anytime" | "HH:MM"
  meals_per_day: z.number().int().min(3).max(6).optional(),
});

router.get('/', (req, res) => {
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.user.id) || {};
  res.json({ profile, targets: computeTargets(profile) });
});

router.put('/', (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const fields = parsed.data;
  const keys = Object.keys(fields);
  db.prepare('INSERT OR IGNORE INTO profiles (user_id) VALUES (?)').run(req.user.id);
  if (keys.length) {
    const set = keys.map((k) => `${k} = @${k}`).join(', ');
    db.prepare(
      `UPDATE profiles SET ${set}, updated_at = datetime('now') WHERE user_id = @user_id`
    ).run({ ...fields, user_id: req.user.id });
  }
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.user.id);
  res.json({ profile, targets: computeTargets(profile) });
});

export default router;
