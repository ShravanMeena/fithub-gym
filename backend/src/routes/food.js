import { Router } from 'express';
import { z } from 'zod';
import { q, one } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { estimateFoodFromImage, estimateFoodFromText } from '../services/bedrock.js';
import { aiRequired } from '../middleware/ai.js';

const router = Router();
router.use(authRequired);

router.post('/estimate', aiRequired, async (req, res) => {
  const { imageBase64, mediaType, note } = req.body || {};
  if (!imageBase64 || typeof imageBase64 !== 'string') return res.status(400).json({ error: 'imageBase64 is required' });
  try {
    const result = await estimateFoodFromImage({ imageBase64, mediaType, note, ctx: { userId: req.user?.id } });
    res.json({ estimate: result });
  } catch (err) {
    console.error('food/estimate error:', err);
    res.status(502).json({ error: 'AI food analysis failed. Try again.' });
  }
});

router.post('/estimate-text', aiRequired, async (req, res) => {
  const text = (req.body?.text || '').toString().trim();
  if (text.length < 2) return res.status(400).json({ error: 'Describe your meal, e.g. "2 eggs and butter roti"' });
  try {
    const result = await estimateFoodFromText({ description: text, ctx: { userId: req.user?.id } });
    res.json({ estimate: result });
  } catch (err) {
    console.error('food/estimate-text error:', err);
    res.status(502).json({ error: 'AI food analysis failed. Try again.' });
  }
});

const logSchema = z.object({
  name: z.string().min(1),
  calories: z.number().min(0),
  protein_g: z.number().min(0).default(0),
  carbs_g: z.number().min(0).default(0),
  fat_g: z.number().min(0).default(0),
  items: z.array(z.any()).optional(),
  source: z.enum(['photo', 'manual']).default('manual'),
});

router.post('/log', async (req, res, next) => {
  try {
    const parsed = logSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const d = parsed.data;
    const row = await one(
      `INSERT INTO food_logs (user_id, name, calories, protein_g, carbs_g, fat_g, items_json, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [req.user.id, d.name, d.calories, d.protein_g, d.carbs_g, d.fat_g, d.items ? JSON.stringify(d.items) : null, d.source]
    );
    res.json({ id: row.id });
  } catch (e) { next(e); }
});

// Food for a specific day (?date=YYYY-MM-DD; defaults to today). Powers the diary.
router.get('/day', async (req, res, next) => {
  try {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : null;
    const logs = await q(
      `SELECT * FROM food_logs WHERE user_id = $1 AND eaten_at::date = COALESCE($2::date, current_date) ORDER BY eaten_at DESC`,
      [req.user.id, date]
    );
    const totals = logs.reduce(
      (t, r) => ({ calories: t.calories + r.calories, protein_g: t.protein_g + r.protein_g, carbs_g: t.carbs_g + r.carbs_g, fat_g: t.fat_g + r.fat_g }),
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    );
    res.json({ logs, totals });
  } catch (e) { next(e); }
});

router.get('/today', async (req, res, next) => {
  try {
    const logs = await q(
      `SELECT * FROM food_logs WHERE user_id = $1 AND eaten_at::date = current_date ORDER BY eaten_at DESC`,
      [req.user.id]
    );
    const totals = logs.reduce(
      (t, r) => ({
        calories: t.calories + r.calories,
        protein_g: t.protein_g + r.protein_g,
        carbs_g: t.carbs_g + r.carbs_g,
        fat_g: t.fat_g + r.fat_g,
      }),
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    );
    res.json({ logs, totals });
  } catch (e) { next(e); }
});

// Distinct recently-logged foods, for one-tap re-logging (free, no AI).
router.get('/recent', async (req, res, next) => {
  try {
    const rows = await q(
      `SELECT DISTINCT ON (lower(name)) name, calories, protein_g, carbs_g, fat_g
       FROM food_logs WHERE user_id = $1 AND eaten_at >= now() - interval '45 days'
       ORDER BY lower(name), eaten_at DESC`,
      [req.user.id]
    );
    res.json({ recent: rows.slice(0, 15) });
  } catch (e) { next(e); }
});

router.delete('/log/:id', async (req, res, next) => {
  try {
    await one('DELETE FROM food_logs WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
