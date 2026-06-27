import { Router } from 'express';
import { z } from 'zod';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync, statSync, createReadStream } from 'fs';
import { db } from '../db/index.js';
import { authRequired, verifyToken } from '../middleware/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FEED_DIR = join(__dirname, '..', '..', 'data', 'feed');
mkdirSync(FEED_DIR, { recursive: true });

const router = Router();

function orgId(userId) {
  return db.prepare('SELECT org_id FROM users WHERE id = ?').get(userId)?.org_id;
}

// Serve media bytes. Auth via Bearer header OR ?token= (video players can't send
// headers reliably). Defined BEFORE the global auth gate. Org-scoped.
router.get('/:id/media', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '') || req.query.token;
  const user = verifyToken(token);
  if (!user) return res.status(401).end();
  const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!row || !row.media_path || !existsSync(row.media_path)) return res.status(404).end();
  // visible if public, or same org
  if (!row.is_public && row.org_id !== orgId(user.id)) return res.status(403).end();

  const size = statSync(row.media_path).size;
  const ctype = row.media_type || 'application/octet-stream';
  res.set('Content-Type', ctype);
  res.set('Accept-Ranges', 'bytes');

  // Honour HTTP Range requests so iOS AVPlayer can stream/seek video (needs 206).
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d+)-(\d*)/.exec(range);
    const start = m ? parseInt(m[1], 10) : 0;
    const end = m && m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
    if (start >= size) return res.status(416).set('Content-Range', `bytes */${size}`).end();
    res.status(206);
    res.set('Content-Range', `bytes ${start}-${end}/${size}`);
    res.set('Content-Length', end - start + 1);
    return createReadStream(row.media_path, { start, end }).pipe(res);
  }
  res.set('Content-Length', size);
  createReadStream(row.media_path).pipe(res);
});

// Everything below requires a normal Bearer token.
router.use(authRequired);

const extFor = (mt) =>
  mt === 'image/png' ? 'png' : mt === 'video/mp4' ? 'mp4' : mt === 'video/quicktime' ? 'mov' : 'jpg';

function shape(row, userId) {
  const likes = db.prepare('SELECT COUNT(*) AS c FROM post_likes WHERE post_id = ?').get(row.id)?.c || 0;
  const liked = userId
    ? !!db.prepare('SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?').get(row.id, userId)
    : false;
  return {
    id: row.id,
    type: row.type,
    content: row.content,
    media_url: row.media_path ? `/api/feed/${row.id}/media` : null,
    author: row.author_name,
    gym: row.gym_name || null,
    created_at: row.created_at,
    is_announcement: !!row.is_announcement,
    is_public: !!row.is_public,
    likes,
    liked,
    mine: row.user_id === userId,
  };
}

const PAGE = 15;

const createSchema = z.object({
  type: z.enum(['text', 'image', 'video']).default('text'),
  content: z.string().max(2000).optional(),
  mediaBase64: z.string().optional(),
  mediaType: z.string().optional(),
  is_public: z.boolean().default(true),
});

// Create a post. text, or image/video with base64 media.
router.post('/', (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;
  if (d.type === 'text' && !d.content?.trim()) return res.status(400).json({ error: 'Write something to post.' });
  if (d.type !== 'text' && !d.mediaBase64) return res.status(400).json({ error: 'Attach media for this post.' });

  const info = db
    .prepare('INSERT INTO posts (user_id, org_id, type, content, media_type, is_public) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.user.id, orgId(req.user.id), d.type, d.content?.trim() || null, d.mediaType || null, d.is_public ? 1 : 0);

  if (d.mediaBase64) {
    const fname = `${info.lastInsertRowid}.${extFor(d.mediaType)}`;
    const fpath = join(FEED_DIR, fname);
    writeFileSync(fpath, Buffer.from(d.mediaBase64, 'base64'));
    db.prepare('UPDATE posts SET media_path = ? WHERE id = ?').run(fpath, info.lastInsertRowid);
  }

  const row = db
    .prepare('SELECT p.*, u.name AS author_name FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?')
    .get(info.lastInsertRowid);
  res.json({ post: shape(row, req.user.id) });
});

// Community feed: the user's own gym. Paginated with ?before=<id>.
router.get('/', (req, res) => {
  const oid = orgId(req.user.id);
  const before = req.query.before ? Number(req.query.before) : null;
  const rows = db
    .prepare(
      `SELECT p.*, u.name AS author_name, o.name AS gym_name FROM posts p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN organizations o ON o.id = p.org_id
       WHERE p.org_id = ? AND (? IS NULL OR p.id < ?)
       ORDER BY p.id DESC LIMIT ?`
    )
    .all(oid, before, before, PAGE + 1);
  const hasMore = rows.length > PAGE;
  const page = rows.slice(0, PAGE);
  res.json({ posts: page.map((r) => shape(r, req.user.id)), nextBefore: hasMore ? page[page.length - 1].id : null });
});

// Public/Explore feed: public posts from ALL gyms. Paginated with ?before=<id>.
router.get('/public', (req, res) => {
  const before = req.query.before ? Number(req.query.before) : null;
  const rows = db
    .prepare(
      `SELECT p.*, u.name AS author_name, o.name AS gym_name FROM posts p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN organizations o ON o.id = p.org_id
       WHERE p.is_public = 1 AND p.is_announcement = 0 AND (? IS NULL OR p.id < ?)
       ORDER BY p.id DESC LIMIT ?`
    )
    .all(before, before, PAGE + 1);
  const hasMore = rows.length > PAGE;
  const page = rows.slice(0, PAGE);
  res.json({ posts: page.map((r) => shape(r, req.user.id)), nextBefore: hasMore ? page[page.length - 1].id : null });
});

router.post('/:id/like', (req, res) => {
  db.prepare('INSERT OR IGNORE INTO post_likes (post_id, user_id) VALUES (?, ?)').run(req.params.id, req.user.id);
  const likes = db.prepare('SELECT COUNT(*) AS c FROM post_likes WHERE post_id = ?').get(req.params.id)?.c || 0;
  res.json({ likes, liked: true });
});

router.delete('/:id/like', (req, res) => {
  db.prepare('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?').run(req.params.id, req.user.id);
  const likes = db.prepare('SELECT COUNT(*) AS c FROM post_likes WHERE post_id = ?').get(req.params.id)?.c || 0;
  res.json({ likes, liked: false });
});

router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (row?.media_path && existsSync(row.media_path)) { try { unlinkSync(row.media_path); } catch {} }
  db.prepare('DELETE FROM posts WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

export default router;
