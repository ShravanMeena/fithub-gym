import { Router } from 'express';
import { z } from 'zod';
import { q, one } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { aiRequired } from '../middleware/ai.js';
import { computeTargets } from '../services/nutrition.js';
import { analyzeProgressPhotos } from '../services/bedrock.js';
import { saveFile, streamFile, readBuffer, deleteFile, fileExists } from '../services/storage.js';

const router = Router();

const extFor = (mt) => (mt === 'image/png' ? 'png' : 'jpg');
const keyFor = (userId, id, mt) => `photos/${userId}/${id}.${extFor(mt)}`;

function publicPhoto(row, ownerName) {
  return {
    id: row.id, url: `/api/photos/${row.id}/image`, visibility: row.visibility,
    weight_kg: row.weight_kg, note: row.note, taken_at: row.taken_at, owner: ownerName,
  };
}

const uploadSchema = z.object({
  imageBase64: z.string().min(10),
  mediaType: z.string().optional(),
  visibility: z.enum(['private', 'public']).default('private'),
  weight_kg: z.number().min(25).max(300).optional(),
  note: z.string().max(300).optional(),
});

router.post('/', authRequired, async (req, res, next) => {
  try {
    const parsed = uploadSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const d = parsed.data;
    const mt = d.mediaType || 'image/jpeg';
    const row = await one(
      `INSERT INTO progress_photos (user_id, file_path, media_type, visibility, weight_kg, note)
       VALUES ($1,'',$2,$3,$4,$5) RETURNING *`,
      [req.user.id, mt, d.visibility, d.weight_kg ?? null, d.note ?? null]
    );
    const key = keyFor(req.user.id, row.id, mt);
    await saveFile(key, Buffer.from(d.imageBase64, 'base64'), mt);
    await one('UPDATE progress_photos SET file_path = $1 WHERE id = $2 RETURNING id', [key, row.id]);
    res.json({ photo: publicPhoto({ ...row, file_path: key }) });
  } catch (e) { next(e); }
});

router.get('/', authRequired, async (req, res, next) => {
  try {
    const rows = await q('SELECT * FROM progress_photos WHERE user_id = $1 ORDER BY taken_at DESC', [req.user.id]);
    res.json({ photos: rows.map((r) => publicPhoto(r)) });
  } catch (e) { next(e); }
});

router.get('/feed', authRequired, async (req, res, next) => {
  try {
    const rows = await q(
      `SELECT p.*, u.name AS owner_name FROM progress_photos p JOIN users u ON u.id = p.user_id
       WHERE p.visibility = 'public' ORDER BY p.taken_at DESC LIMIT 50`
    );
    res.json({ photos: rows.map((r) => publicPhoto(r, r.owner_name)) });
  } catch (e) { next(e); }
});

router.get('/:id/image', authRequired, async (req, res, next) => {
  try {
    const row = await one('SELECT * FROM progress_photos WHERE id = $1', [req.params.id]);
    if (!row || !row.file_path || !(await fileExists(row.file_path))) return res.status(404).end();
    if (row.visibility !== 'public' && row.user_id !== req.user.id) return res.status(403).end();
    res.set('Content-Type', row.media_type);
    streamFile(row.file_path).on('error', () => res.status(404).end()).pipe(res);
  } catch (e) { next(e); }
});

router.put('/:id', authRequired, async (req, res, next) => {
  try {
    const vis = req.body?.visibility;
    if (!['private', 'public'].includes(vis)) return res.status(400).json({ error: 'visibility must be private|public' });
    const row = await one('UPDATE progress_photos SET visibility = $1 WHERE id = $2 AND user_id = $3 RETURNING *', [vis, req.params.id, req.user.id]);
    res.json({ photo: row ? publicPhoto(row) : null });
  } catch (e) { next(e); }
});

router.delete('/:id', authRequired, async (req, res, next) => {
  try {
    const row = await one('SELECT * FROM progress_photos WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (row?.file_path) await deleteFile(row.file_path);
    await one('DELETE FROM progress_photos WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/analyze', authRequired, aiRequired, async (req, res) => {
  try {
    const photos = await q('SELECT * FROM progress_photos WHERE user_id = $1 ORDER BY taken_at ASC', [req.user.id]);
    if (photos.length === 0) return res.status(400).json({ error: 'Upload at least one progress photo first.' });
    const chosen = photos.length === 1 ? [photos[0]] : [photos[0], photos[photos.length - 1]];
    const images = [];
    for (const p of chosen) {
      if (p.file_path && (await fileExists(p.file_path))) {
        images.push({ base64: (await readBuffer(p.file_path)).toString('base64'), mediaType: p.media_type });
      }
    }
    if (images.length === 0) return res.status(400).json({ error: 'Photo files missing.' });

    const profile = (await one('SELECT * FROM profiles WHERE user_id = $1', [req.user.id])) || {};
    const progress = await q('SELECT weight_kg, logged_at FROM progress_logs WHERE user_id = $1 ORDER BY logged_at ASC', [req.user.id]);
    const analysis = await analyzeProgressPhotos({ images, profile, progress, targets: computeTargets(profile) });
    res.json({ analysis, comparedPhotos: chosen.length });
  } catch (err) {
    console.error('photos/analyze error:', err);
    res.status(502).json({ error: 'AI analysis failed. Try again.' });
  }
});

export default router;
