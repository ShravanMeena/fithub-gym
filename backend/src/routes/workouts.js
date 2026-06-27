import { Router } from 'express';
import { z } from 'zod';
import { q, one, pool } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { sendToUser } from '../services/push.js';

const router = Router();
router.use(authRequired);

const orgId = async (userId) => (await one('SELECT org_id FROM users WHERE id = $1', [userId]))?.org_id;

const createSchema = z.object({
  title: z.string().max(80).optional(),
  notes: z.string().max(300).optional(),
  sets: z.array(z.object({
    exercise: z.string().min(1).max(60),
    weight_kg: z.number().min(0).max(1000).default(0),
    reps: z.number().int().min(0).max(1000).default(0),
    set_no: z.number().int().min(1).max(50).optional(),
  })).min(1),
});

router.post('/', async (req, res, next) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { title, notes, sets } = parsed.data;

  // Prior best weight per exercise (before this workout) — for PR detection.
  const names = [...new Set(sets.map((s) => s.exercise.trim()))];
  const priorRows = await q(
    'SELECT exercise, MAX(weight_kg) AS best FROM workout_sets WHERE user_id = $1 AND exercise = ANY($2) GROUP BY exercise',
    [req.user.id, names]
  );
  const prior = Object.fromEntries(priorRows.map((r) => [r.exercise, r.best || 0]));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const w = (await client.query(
      'INSERT INTO workouts (user_id, org_id, title, notes) VALUES ($1,$2,$3,$4) RETURNING id',
      [req.user.id, await orgId(req.user.id), title || 'Workout', notes || null]
    )).rows[0];
    let i = 0;
    for (const s of sets) {
      i++;
      await client.query(
        'INSERT INTO workout_sets (workout_id, user_id, exercise, weight_kg, reps, set_no) VALUES ($1,$2,$3,$4,$5,$6)',
        [w.id, req.user.id, s.exercise.trim(), s.weight_kg, s.reps, s.set_no || i]
      );
    }
    await client.query('COMMIT');

    // New PRs: best weight this workout beats the prior best for that exercise.
    const thisMax = {};
    for (const s of sets) {
      const ex = s.exercise.trim();
      if (s.weight_kg > 0) thisMax[ex] = Math.max(thisMax[ex] || 0, s.weight_kg);
    }
    const prs = Object.entries(thisMax)
      .filter(([ex, wt]) => wt > (prior[ex] || 0))
      .map(([exercise, weight]) => ({ exercise, weight, prev: prior[exercise] || 0 }));

    if (prs.length) {
      const top = prs[0];
      const gain = top.prev > 0 ? ` (+${Math.round((top.weight - top.prev) * 10) / 10}kg)` : '';
      sendToUser(req.user.id, {
        title: '🎉 New Personal Record!',
        body: prs.length === 1
          ? `${top.exercise} ${top.weight}kg${gain}`
          : `${top.exercise} ${top.weight}kg${gain} +${prs.length - 1} more`,
        data: { type: 'pr', screen: 'Workout' },
      }).catch(() => {});
    }

    res.json({ id: w.id, prs });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    next(e);
  } finally {
    client.release();
  }
});

router.get('/', async (req, res, next) => {
  try {
    const workouts = await q('SELECT * FROM workouts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [req.user.id]);
    const withSets = [];
    for (const w of workouts) {
      const sets = await q('SELECT exercise, weight_kg, reps, set_no FROM workout_sets WHERE workout_id = $1 ORDER BY id', [w.id]);
      const volume = sets.reduce((v, s) => v + s.weight_kg * s.reps, 0);
      withSets.push({ ...w, sets, volume: Math.round(volume), exercises: [...new Set(sets.map((s) => s.exercise))] });
    }
    res.json({ workouts: withSets });
  } catch (e) { next(e); }
});

router.get('/prs', async (req, res, next) => {
  try {
    const rows = await q(
      `SELECT exercise, MAX(weight_kg) AS best_weight FROM workout_sets
       WHERE user_id = $1 AND weight_kg > 0 GROUP BY exercise ORDER BY best_weight DESC`,
      [req.user.id]
    );
    const prs = [];
    for (const r of rows) {
      const top = await one('SELECT MAX(reps) AS reps FROM workout_sets WHERE user_id = $1 AND exercise = $2 AND weight_kg = $3', [req.user.id, r.exercise, r.best_weight]);
      const reps = top?.reps || 1;
      prs.push({ exercise: r.exercise, best_weight: r.best_weight, reps, est_1rm: Math.round(r.best_weight * (1 + reps / 30)) });
    }
    const totals = await one('SELECT COUNT(*) AS workouts FROM workouts WHERE user_id = $1', [req.user.id]);
    res.json({ prs, totalWorkouts: totals?.workouts || 0 });
  } catch (e) { next(e); }
});

// Per-exercise strength progression over time (best estimated 1RM per session).
// Epley 1RM = weight * (1 + reps/30); reps capped at 12 so high-rep sets don't
// inflate the estimate. Used for the progress charts.
router.get('/strength', async (req, res, next) => {
  try {
    const rows = await q(
      `SELECT w.created_at::date AS date, ws.exercise,
              MAX(ws.weight_kg * (1 + LEAST(ws.reps, 12) / 30.0)) AS est_1rm,
              MAX(ws.weight_kg) AS top_weight
       FROM workout_sets ws JOIN workouts w ON w.id = ws.workout_id
       WHERE ws.user_id = $1 AND ws.weight_kg > 0
       GROUP BY w.created_at::date, ws.exercise
       ORDER BY date ASC`,
      [req.user.id]
    );
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.exercise)) map.set(r.exercise, []);
      map.get(r.exercise).push({ date: r.date, est1rm: Math.round(r.est_1rm), topWeight: r.top_weight });
    }
    const series = [...map.entries()]
      .map(([exercise, points]) => ({ exercise, points, sessions: points.length }))
      .sort((a, b) => b.sessions - a.sessions);
    res.json({ series });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await one('DELETE FROM workouts WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
