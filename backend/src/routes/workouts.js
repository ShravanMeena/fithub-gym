import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

function orgId(userId) {
  return db.prepare('SELECT org_id FROM users WHERE id = ?').get(userId)?.org_id;
}

const createSchema = z.object({
  title: z.string().max(80).optional(),
  notes: z.string().max(300).optional(),
  sets: z
    .array(
      z.object({
        exercise: z.string().min(1).max(60),
        weight_kg: z.number().min(0).max(1000).default(0),
        reps: z.number().int().min(0).max(1000).default(0),
        set_no: z.number().int().min(1).max(50).optional(),
      })
    )
    .min(1),
});

// Save a workout session with its sets.
router.post('/', (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { title, notes, sets } = parsed.data;

  const tx = db.transaction(() => {
    const info = db
      .prepare('INSERT INTO workouts (user_id, org_id, title, notes) VALUES (?, ?, ?, ?)')
      .run(req.user.id, orgId(req.user.id), title || 'Workout', notes || null);
    const wid = info.lastInsertRowid;
    const ins = db.prepare(
      'INSERT INTO workout_sets (workout_id, user_id, exercise, weight_kg, reps, set_no) VALUES (?, ?, ?, ?, ?, ?)'
    );
    sets.forEach((s, i) => ins.run(wid, req.user.id, s.exercise.trim(), s.weight_kg, s.reps, s.set_no || i + 1));
    return wid;
  });
  const id = tx();
  res.json({ id });
});

// List my workouts (newest first) with their sets.
router.get('/', (req, res) => {
  const workouts = db
    .prepare('SELECT * FROM workouts WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(req.user.id);
  const getSets = db.prepare('SELECT exercise, weight_kg, reps, set_no FROM workout_sets WHERE workout_id = ? ORDER BY id');
  const withSets = workouts.map((w) => {
    const sets = getSets.all(w.id);
    const volume = sets.reduce((v, s) => v + s.weight_kg * s.reps, 0);
    return { ...w, sets, volume: Math.round(volume), exercises: [...new Set(sets.map((s) => s.exercise))] };
  });
  res.json({ workouts: withSets });
});

// Personal records: best weight per exercise + estimated 1RM (Epley).
router.get('/prs', (req, res) => {
  const rows = db
    .prepare(
      `SELECT exercise, MAX(weight_kg) AS best_weight FROM workout_sets
       WHERE user_id = ? AND weight_kg > 0 GROUP BY exercise ORDER BY best_weight DESC`
    )
    .all(req.user.id);
  const prs = rows.map((r) => {
    // reps at that best weight (take the max reps among the heaviest sets)
    const top = db
      .prepare('SELECT MAX(reps) AS reps FROM workout_sets WHERE user_id = ? AND exercise = ? AND weight_kg = ?')
      .get(req.user.id, r.exercise, r.best_weight);
    const reps = top?.reps || 1;
    const est1rm = Math.round(r.best_weight * (1 + reps / 30));
    return { exercise: r.exercise, best_weight: r.best_weight, reps, est_1rm: est1rm };
  });
  const totals = db
    .prepare('SELECT COUNT(*) AS workouts FROM workouts WHERE user_id = ?')
    .get(req.user.id);
  res.json({ prs, totalWorkouts: totals?.workouts || 0 });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM workouts WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

export default router;
