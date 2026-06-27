import { Router } from 'express';
import { z } from 'zod';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs';
import { db } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { computeTargets } from '../services/nutrition.js';
import { analyzeProgressPhotos } from '../services/bedrock.js';
import { aiRequired } from '../middleware/ai.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = join(__dirname, '..', '..', 'data', 'uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });

const router = Router();

const extFor = (mt) => (mt === 'image/png' ? 'png' : 'jpg');

function publicPhoto(row, ownerName) {
  return {
    id: row.id,
    url: `/api/photos/${row.id}/image`,
    visibility: row.visibility,
    weight_kg: row.weight_kg,
    note: row.note,
    taken_at: row.taken_at,
    owner: ownerName,
  };
}

const uploadSchema = z.object({
  imageBase64: z.string().min(10),
  mediaType: z.string().optional(),
  visibility: z.enum(['private', 'public']).default('private'),
  weight_kg: z.number().min(25).max(300).optional(),
  note: z.string().max(300).optional(),
});

// Upload a progress photo (default private).
router.post('/', authRequired, (req, res) => {
  const parsed = uploadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;

  const userDir = join(UPLOAD_DIR, String(req.user.id));
  mkdirSync(userDir, { recursive: true });
  // temp name; we need the row id for a stable filename, so insert first.
  const info = db
    .prepare(
      `INSERT INTO progress_photos (user_id, file_path, media_type, visibility, weight_kg, note)
       VALUES (?, '', ?, ?, ?, ?)`
    )
    .run(req.user.id, d.mediaType || 'image/jpeg', d.visibility, d.weight_kg ?? null, d.note ?? null);

  const fname = `${info.lastInsertRowid}.${extFor(d.mediaType)}`;
  const fpath = join(userDir, fname);
  writeFileSync(fpath, Buffer.from(d.imageBase64, 'base64'));
  db.prepare('UPDATE progress_photos SET file_path = ? WHERE id = ?').run(fpath, info.lastInsertRowid);

  const row = db.prepare('SELECT * FROM progress_photos WHERE id = ?').get(info.lastInsertRowid);
  res.json({ photo: publicPhoto(row) });
});

// List my photos (newest first).
router.get('/', authRequired, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM progress_photos WHERE user_id = ? ORDER BY taken_at DESC')
    .all(req.user.id);
  res.json({ photos: rows.map((r) => publicPhoto(r)) });
});

// Public feed (everyone's public photos).
router.get('/feed', authRequired, (req, res) => {
  const rows = db
    .prepare(
      `SELECT p.*, u.name AS owner_name FROM progress_photos p
       JOIN users u ON u.id = p.user_id
       WHERE p.visibility = 'public' ORDER BY p.taken_at DESC LIMIT 50`
    )
    .all();
  res.json({ photos: rows.map((r) => publicPhoto(r, r.owner_name)) });
});

// Serve the image bytes. Owner can see private; anyone (authed) can see public.
router.get('/:id/image', authRequired, (req, res) => {
  const row = db.prepare('SELECT * FROM progress_photos WHERE id = ?').get(req.params.id);
  if (!row || !existsSync(row.file_path)) return res.status(404).end();
  if (row.visibility !== 'public' && row.user_id !== req.user.id) return res.status(403).end();
  res.set('Content-Type', row.media_type);
  res.send(readFileSync(row.file_path));
});

// Toggle visibility.
router.put('/:id', authRequired, (req, res) => {
  const vis = req.body?.visibility;
  if (!['private', 'public'].includes(vis)) return res.status(400).json({ error: 'visibility must be private|public' });
  db.prepare('UPDATE progress_photos SET visibility = ? WHERE id = ? AND user_id = ?').run(vis, req.params.id, req.user.id);
  const row = db.prepare('SELECT * FROM progress_photos WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  res.json({ photo: row ? publicPhoto(row) : null });
});

router.delete('/:id', authRequired, (req, res) => {
  const row = db.prepare('SELECT * FROM progress_photos WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (row && existsSync(row.file_path)) {
    try { unlinkSync(row.file_path); } catch {}
  }
  db.prepare('DELETE FROM progress_photos WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// AI: analyze progress using the user's photos (oldest + newest) + weight history.
router.post('/analyze', authRequired, aiRequired, async (req, res) => {
  const photos = db
    .prepare('SELECT * FROM progress_photos WHERE user_id = ? ORDER BY taken_at ASC')
    .all(req.user.id);
  if (photos.length === 0) {
    return res.status(400).json({ error: 'Upload at least one progress photo first.' });
  }
  // oldest + newest (or just the one)
  const chosen = photos.length === 1 ? [photos[0]] : [photos[0], photos[photos.length - 1]];
  const images = chosen
    .filter((p) => existsSync(p.file_path))
    .map((p) => ({ base64: readFileSync(p.file_path).toString('base64'), mediaType: p.media_type }));
  if (images.length === 0) return res.status(400).json({ error: 'Photo files missing.' });

  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.user.id) || {};
  const progress = db
    .prepare('SELECT weight_kg, logged_at FROM progress_logs WHERE user_id = ? ORDER BY logged_at ASC')
    .all(req.user.id);

  try {
    const analysis = await analyzeProgressPhotos({ images, profile, progress, targets: computeTargets(profile) });
    res.json({ analysis, comparedPhotos: chosen.length });
  } catch (err) {
    console.error('photos/analyze error:', err);
    res.status(502).json({ error: 'AI analysis failed. Try again.' });
  }
});

export default router;
