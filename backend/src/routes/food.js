import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { estimateFoodFromImage, estimateFoodFromText } from '../services/bedrock.js';
import { aiRequired } from '../middleware/ai.js';

const router = Router();
router.use(authRequired);

// Estimate nutrition from a photo. Body: { imageBase64, mediaType?, note? }
// Does NOT log automatically — returns the estimate so the user can confirm.
router.post('/estimate', aiRequired, async (req, res) => {
  const { imageBase64, mediaType, note } = req.body || {};
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return res.status(400).json({ error: 'imageBase64 is required' });
  }
  try {
    const result = await estimateFoodFromImage({ imageBase64, mediaType, note });
    res.json({ estimate: result });
  } catch (err) {
    console.error('food/estimate error:', err);
    res.status(502).json({ error: 'AI food analysis failed. Try again.' });
  }
});

// Estimate nutrition from a typed description (no photo). Body: { text }
router.post('/estimate-text', aiRequired, async (req, res) => {
  const text = (req.body?.text || '').toString().trim();
  if (text.length < 2) return res.status(400).json({ error: 'Describe your meal, e.g. "2 eggs and butter roti"' });
  try {
    const result = await estimateFoodFromText({ description: text });
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

// Persist a meal to the food log.
router.post('/log', (req, res) => {
  const parsed = logSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const d = parsed.data;
  const info = db
    .prepare(
      `INSERT INTO food_logs (user_id, name, calories, protein_g, carbs_g, fat_g, items_json, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.user.id,
      d.name,
      d.calories,
      d.protein_g,
      d.carbs_g,
      d.fat_g,
      d.items ? JSON.stringify(d.items) : null,
      d.source
    );
  res.json({ id: info.lastInsertRowid });
});

// Today's log + running totals.
router.get('/today', (req, res) => {
  const rows = db
    .prepare(
      `SELECT * FROM food_logs
       WHERE user_id = ? AND date(eaten_at) = date('now','localtime')
       ORDER BY eaten_at DESC`
    )
    .all(req.user.id);
  const totals = rows.reduce(
    (t, r) => ({
      calories: t.calories + r.calories,
      protein_g: t.protein_g + r.protein_g,
      carbs_g: t.carbs_g + r.carbs_g,
      fat_g: t.fat_g + r.fat_g,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );
  res.json({ logs: rows, totals });
});

router.delete('/log/:id', (req, res) => {
  db.prepare('DELETE FROM food_logs WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

export default router;
