import { Router } from 'express';
import { z } from 'zod';
import { q, one } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { estimateFoodFromImage, estimateFoodFromText } from '../services/bedrock.js';
import { aiRequired } from '../middleware/ai.js';
import { saveFile, streamFile, fileExists } from '../services/storage.js';

const router = Router();
router.use(authRequired);

// Attach a servable photo URL to a food-log row (only when a photo was stored).
const withPhoto = (r) => ({ ...r, photo_url: r.photo_path ? `/api/food/photo/${r.id}` : null });

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
  source: z.string().max(20).optional().default('manual'),
  imageBase64: z.string().min(10).optional(),
  mediaType: z.string().optional(),
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
    // Optionally attach the meal photo so the diary shows what you ate.
    let photo_url = null;
    if (d.imageBase64) {
      try {
        const mt = d.mediaType || 'image/jpeg';
        const key = `meals/${req.user.id}/${row.id}.${mt === 'image/png' ? 'png' : 'jpg'}`;
        await saveFile(key, Buffer.from(d.imageBase64, 'base64'), mt);
        await one('UPDATE food_logs SET photo_path = $1 WHERE id = $2 RETURNING id', [key, row.id]);
        photo_url = `/api/food/photo/${row.id}`;
      } catch (err) { console.error('meal photo save failed:', err.message); }
    }
    res.json({ id: row.id, photo_url });
  } catch (e) { next(e); }
});

// Serve a meal photo (owner only).
router.get('/photo/:id', async (req, res, next) => {
  try {
    const row = await one('SELECT * FROM food_logs WHERE id = $1', [req.params.id]);
    if (!row || row.user_id !== req.user.id || !row.photo_path || !(await fileExists(row.photo_path))) return res.status(404).end();
    res.set('Content-Type', row.photo_path.endsWith('.png') ? 'image/png' : 'image/jpeg');
    res.set('Cache-Control', 'private, max-age=86400');
    streamFile(row.photo_path).on('error', () => res.status(404).end()).pipe(res);
  } catch (e) { next(e); }
});

// Barcode lookup for packaged food via Open Food Facts (free, no AI, no key).
router.get('/barcode/:code', async (req, res, next) => {
  try {
    const code = String(req.params.code).replace(/[^0-9]/g, '');
    if (code.length < 6) return res.status(400).json({ error: 'Invalid barcode' });
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 7000);
    let data;
    try {
      const r = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,serving_size,nutriments`,
        { signal: ctrl.signal, headers: { 'User-Agent': 'FitHub/1.0 (gym app)' } }
      );
      data = await r.json();
    } finally { clearTimeout(t); }

    if (!data || data.status !== 1 || !data.product) return res.json({ found: false });
    const p = data.product;
    const n = p.nutriments || {};
    const num = (v) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 10) / 10 : 0);
    const per100 = {
      calories: num(n['energy-kcal_100g'] ?? (n['energy_100g'] ? n['energy_100g'] / 4.184 : 0)),
      protein_g: num(n.proteins_100g),
      carbs_g: num(n.carbohydrates_100g),
      fat_g: num(n.fat_100g),
    };
    const hasServing = n['energy-kcal_serving'] != null || n.proteins_serving != null;
    const serving = hasServing
      ? {
          size: p.serving_size || '1 serving',
          calories: num(n['energy-kcal_serving'] ?? (n['energy_serving'] ? n['energy_serving'] / 4.184 : 0)),
          protein_g: num(n.proteins_serving),
          carbs_g: num(n.carbohydrates_serving),
          fat_g: num(n.fat_serving),
        }
      : null;
    const name = [p.brands ? p.brands.split(',')[0].trim() : '', p.product_name].filter(Boolean).join(' ').trim() || 'Packaged food';
    res.json({ found: true, name, per100g: per100, serving });
  } catch (e) {
    if (e.name === 'AbortError') return res.status(504).json({ error: 'Lookup timed out' });
    next(e);
  }
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
    res.json({ logs: logs.map(withPhoto), totals });
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
    res.json({ logs: logs.map(withPhoto), totals });
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
