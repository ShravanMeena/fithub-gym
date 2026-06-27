import { Router } from 'express';
import { z } from 'zod';
import { q, one } from '../db/index.js';
import { authRequired, verifyToken } from '../middleware/auth.js';
import { saveFile, streamFile, deleteFile, fileExists, fileSize } from '../services/storage.js';

const router = Router();

const orgId = async (userId) => (await one('SELECT org_id FROM users WHERE id = $1', [userId]))?.org_id;
const extFor = (mt) => (mt === 'image/png' ? 'png' : mt === 'video/mp4' ? 'mp4' : mt === 'video/quicktime' ? 'mov' : 'jpg');
const PAGE = 15;

// Serve media. Auth via Bearer header OR ?token= (video players can't send headers).
router.get('/:id/media', async (req, res, next) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '') || req.query.token;
    const user = verifyToken(token);
    if (!user) return res.status(401).end();
    const row = await one('SELECT * FROM posts WHERE id = $1', [req.params.id]);
    if (!row || !row.media_path || !(await fileExists(row.media_path))) return res.status(404).end();
    if (!row.is_public && row.org_id !== (await orgId(user.id))) return res.status(403).end();

    const size = await fileSize(row.media_path);
    res.set('Content-Type', row.media_type || 'application/octet-stream');
    res.set('Accept-Ranges', 'bytes');
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      const start = m ? parseInt(m[1], 10) : 0;
      const end = m && m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
      if (start >= size) return res.status(416).set('Content-Range', `bytes */${size}`).end();
      res.status(206);
      res.set('Content-Range', `bytes ${start}-${end}/${size}`);
      res.set('Content-Length', end - start + 1);
      return streamFile(row.media_path, { start, end }).on('error', () => res.end()).pipe(res);
    }
    res.set('Content-Length', size);
    streamFile(row.media_path).on('error', () => res.end()).pipe(res);
  } catch (e) { next(e); }
});

router.use(authRequired);

function likeInfo(row, userId) {
  return { id: row.id, type: row.type, content: row.content,
    media_url: row.media_path ? `/api/feed/${row.id}/media` : null,
    author: row.author_name, gym: row.gym_name || null, created_at: row.created_at,
    is_announcement: !!row.is_announcement, is_public: !!row.is_public,
    likes: Number(row.likes) || 0, liked: !!row.liked, mine: row.user_id === userId };
}

const SEL = `p.*, u.name AS author_name, o.name AS gym_name,
  (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) AS likes,
  EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.user_id = $1) AS liked`;

const createSchema = z.object({
  type: z.enum(['text', 'image', 'video']).default('text'),
  content: z.string().max(2000).optional(),
  mediaBase64: z.string().optional(),
  mediaType: z.string().optional(),
  is_public: z.boolean().default(true),
});

router.post('/', async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const d = parsed.data;
    if (d.type === 'text' && !d.content?.trim()) return res.status(400).json({ error: 'Write something to post.' });
    if (d.type !== 'text' && !d.mediaBase64) return res.status(400).json({ error: 'Attach media for this post.' });

    const ins = await one(
      'INSERT INTO posts (user_id, org_id, type, content, media_type, is_public) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [req.user.id, await orgId(req.user.id), d.type, d.content?.trim() || null, d.mediaType || null, d.is_public ? 1 : 0]
    );
    if (d.mediaBase64) {
      const key = `feed/${ins.id}.${extFor(d.mediaType)}`;
      await saveFile(key, Buffer.from(d.mediaBase64, 'base64'), d.mediaType || 'application/octet-stream');
      await one('UPDATE posts SET media_path = $1 WHERE id = $2 RETURNING id', [key, ins.id]);
    }
    const row = await one(`SELECT ${SEL} FROM posts p JOIN users u ON u.id=p.user_id LEFT JOIN organizations o ON o.id=p.org_id WHERE p.id = $2`, [req.user.id, ins.id]);
    res.json({ post: likeInfo(row, req.user.id) });
  } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try {
    const oid = await orgId(req.user.id);
    const before = req.query.before ? Number(req.query.before) : null;
    const rows = await q(
      `SELECT ${SEL} FROM posts p JOIN users u ON u.id=p.user_id LEFT JOIN organizations o ON o.id=p.org_id
       WHERE p.org_id = $2 AND ($3::int IS NULL OR p.id < $3) ORDER BY p.id DESC LIMIT $4`,
      [req.user.id, oid, before, PAGE + 1]
    );
    const hasMore = rows.length > PAGE;
    const page = rows.slice(0, PAGE);
    res.json({ posts: page.map((r) => likeInfo(r, req.user.id)), nextBefore: hasMore ? page[page.length - 1].id : null });
  } catch (e) { next(e); }
});

router.get('/public', async (req, res, next) => {
  try {
    const before = req.query.before ? Number(req.query.before) : null;
    const rows = await q(
      `SELECT ${SEL} FROM posts p JOIN users u ON u.id=p.user_id LEFT JOIN organizations o ON o.id=p.org_id
       WHERE p.is_public = 1 AND p.is_announcement = 0 AND ($2::int IS NULL OR p.id < $2) ORDER BY p.id DESC LIMIT $3`,
      [req.user.id, before, PAGE + 1]
    );
    const hasMore = rows.length > PAGE;
    const page = rows.slice(0, PAGE);
    res.json({ posts: page.map((r) => likeInfo(r, req.user.id)), nextBefore: hasMore ? page[page.length - 1].id : null });
  } catch (e) { next(e); }
});

router.post('/:id/like', async (req, res, next) => {
  try {
    await one('INSERT INTO post_likes (post_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING post_id', [req.params.id, req.user.id]);
    const likes = (await one('SELECT COUNT(*) AS c FROM post_likes WHERE post_id = $1', [req.params.id]))?.c || 0;
    res.json({ likes, liked: true });
  } catch (e) { next(e); }
});

router.delete('/:id/like', async (req, res, next) => {
  try {
    await one('DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2 RETURNING post_id', [req.params.id, req.user.id]);
    const likes = (await one('SELECT COUNT(*) AS c FROM post_likes WHERE post_id = $1', [req.params.id]))?.c || 0;
    res.json({ likes, liked: false });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const row = await one('SELECT * FROM posts WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (row?.media_path) await deleteFile(row.media_path);
    await one('DELETE FROM posts WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
