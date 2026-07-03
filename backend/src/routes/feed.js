import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import sharp from 'sharp';
import { q, one } from '../db/index.js';
import { authRequired, verifyToken } from '../middleware/auth.js';
import { saveFile, streamFile, deleteFile, fileExists, fileSize, readBuffer, signedReadUrl, publicUrl } from '../services/storage.js';
import { optimizeVideo } from '../services/video.js';

const router = Router();

const orgId = async (userId) => (await one('SELECT org_id FROM users WHERE id = $1', [userId]))?.org_id;
const extFor = (mt) => (mt === 'image/png' ? 'png' : mt === 'video/mp4' ? 'mp4' : mt === 'video/quicktime' ? 'mov' : 'jpg');
const PAGE = 15;

// Pull lowercase #hashtags out of post text (for interest matching).
const extractTags = (s) => {
  const out = [];
  if (!s) return out;
  const re = /#([A-Za-z0-9_]+)/g;
  let m;
  while ((m = re.exec(s))) out.push(m[1].toLowerCase());
  return out;
};

// Serve media. Auth via Bearer header OR ?token= (video players can't send headers).
router.get('/:id/media', async (req, res, next) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '') || req.query.token;
    const user = verifyToken(token);
    if (!user) return res.status(401).end();
    const row = await one('SELECT * FROM posts WHERE id = $1', [req.params.id]);
    if (!row || !row.media_path || !(await fileExists(row.media_path))) return res.status(404).end();
    if (!row.is_public && row.org_id !== (await orgId(user.id))) return res.status(403).end();

    // Posts never change → let the client cache media aggressively (fast re-loads).
    res.set('Cache-Control', 'public, max-age=31536000, immutable');

    // Thumbnail: ?w=<px> returns a small, compressed JPEG for images (feed lists load
    // fast, Instagram-style). Falls back to the original stream if resize fails.
    const wReq = parseInt(req.query.w, 10);
    const isImage = (row.media_type || '').startsWith('image/');
    if (isImage && Number.isFinite(wReq) && wReq >= 40 && wReq <= 2000) {
      try {
        const buf = await readBuffer(row.media_path);
        const out = await sharp(buf).rotate().resize({ width: wReq, withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer();
        res.set('Content-Type', 'image/jpeg');
        res.set('Content-Length', out.length);
        return res.end(out);
      } catch (e) { /* fall through to original */ }
    }

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
    media_key: row.media_path || null,
    author: row.author_name, authorId: row.user_id, authorAvatar: !!row.author_avatar,
    gym: row.gym_name || null, created_at: row.created_at,
    is_announcement: !!row.is_announcement, is_public: !!row.is_public,
    likes: Number(row.likes) || 0, liked: !!row.liked, myReaction: row.my_reaction || null,
    comments: Number(row.comments) || 0, mine: row.user_id === userId };
}

// Swap the proxy media_url for a direct GCS signed URL (fast streaming). Falls
// back to the proxy path when signing isn't available. Strips the internal key.
async function withSignedMedia(posts) {
  await Promise.all(posts.map(async (p) => {
    // Videos benefit most from direct streaming; images use the cheap cached
    // thumbnail proxy. Prefer a public URL (no IAM), else a signed URL, else proxy.
    if (p.type === 'video' && p.media_key) {
      const url = publicUrl(p.media_key) || await signedReadUrl(p.media_key);
      if (url) p.media_url = url;
    }
    delete p.media_key;
  }));
  return posts;
}

const SEL = `p.*, u.name AS author_name, (u.avatar_path IS NOT NULL) AS author_avatar, o.name AS gym_name,
  (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) AS likes,
  (SELECT COUNT(*) FROM post_comments c WHERE c.post_id = p.id) AS comments,
  (SELECT reaction FROM post_likes l WHERE l.post_id = p.id AND l.user_id = $1) AS my_reaction,
  EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.user_id = $1) AS liked`;

const REACTIONS = ['like', 'fire', 'muscle', 'clap'];

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
      let buf = Buffer.from(d.mediaBase64, 'base64');
      let mt = d.mediaType || 'application/octet-stream';
      let ext = extFor(mt);
      // Videos: transcode to a web-optimized, fast-starting MP4 so they play instantly.
      if (d.type === 'video') {
        const opt = await optimizeVideo(buf, mt);
        buf = opt.buffer; mt = opt.contentType; ext = opt.ext;
        await one('UPDATE posts SET media_type = $1 WHERE id = $2 RETURNING id', [mt, ins.id]);
      }
      const key = `feed/${ins.id}.${ext}`;
      await saveFile(key, buf, mt);
      await one('UPDATE posts SET media_path = $1 WHERE id = $2 RETURNING id', [key, ins.id]);
    }
    const row = await one(`SELECT ${SEL} FROM posts p JOIN users u ON u.id=p.user_id LEFT JOIN organizations o ON o.id=p.org_id WHERE p.id = $2`, [req.user.id, ins.id]);
    res.json({ post: (await withSignedMedia([likeInfo(row, req.user.id)]))[0] });
  } catch (e) { next(e); }
});

// Video upload as a streamed multipart file (reliable on Android, no base64/memory
// blowup). Transcodes to fast-starting MP4, then creates the post.
const videoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });
router.post('/video', videoUpload.single('video'), async (req, res, next) => {
  try {
    if (!req.file?.buffer?.length) return res.status(400).json({ error: 'Attach a video.' });
    const content = (req.body?.content || '').toString().trim().slice(0, 2000) || null;
    const isPublic = req.body?.is_public === 'true' || req.body?.is_public === '1';

    const ins = await one(
      'INSERT INTO posts (user_id, org_id, type, content, is_public) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [req.user.id, await orgId(req.user.id), 'video', content, isPublic ? 1 : 0]
    );
    const opt = await optimizeVideo(req.file.buffer, req.file.mimetype || 'video/mp4');
    const key = `feed/${ins.id}.${opt.ext}`;
    await saveFile(key, opt.buffer, opt.contentType);
    await one('UPDATE posts SET media_path = $1, media_type = $2 WHERE id = $3 RETURNING id', [key, opt.contentType, ins.id]);

    const row = await one(`SELECT ${SEL} FROM posts p JOIN users u ON u.id=p.user_id LEFT JOIN organizations o ON o.id=p.org_id WHERE p.id = $2`, [req.user.id, ins.id]);
    res.json({ post: (await withSignedMedia([likeInfo(row, req.user.id)]))[0] });
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
    res.json({ posts: await withSignedMedia(page.map((r) => likeInfo(r, req.user.id))), nextBefore: hasMore ? page[page.length - 1].id : null });
  } catch (e) { next(e); }
});

// Interest-based "For You" feed — ranked like Instagram, not pure chronological.
// Signals: recency, engagement, authors you interact with, hashtags you like,
// media posts, and your gym's announcements. Offset-paginated (ranking shifts).
router.get('/for-you', async (req, res, next) => {
  try {
    const me = req.user.id;
    const oid = await orgId(me);
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const LIMIT = PAGE;

    // Interest profile: authors + hashtags from posts you authored, liked or commented on.
    const engaged = await q(
      `SELECT p.user_id, p.content FROM posts p
       WHERE p.user_id = $1
          OR p.id IN (SELECT post_id FROM post_likes WHERE user_id = $1)
          OR p.id IN (SELECT post_id FROM post_comments WHERE user_id = $1)
       ORDER BY p.id DESC LIMIT 200`,
      [me]
    );
    const likedAuthors = new Set(engaged.map((r) => r.user_id));
    const likedTags = new Set();
    for (const r of engaged) extractTags(r.content).forEach((t) => likedTags.add(t));

    // Candidate pool: your gym's posts (incl. announcements) + public posts, recent.
    const rows = await q(
      `SELECT ${SEL} FROM posts p JOIN users u ON u.id=p.user_id LEFT JOIN organizations o ON o.id=p.org_id
       WHERE ((p.org_id = $2) OR (p.is_public = 1 AND p.is_announcement = 0))
         AND p.created_at > now() - interval '60 days'
       ORDER BY p.id DESC LIMIT 300`,
      [me, oid]
    );

    const now = Date.now();
    const scored = rows.map((r) => {
      const post = likeInfo(r, me);
      const ageH = Math.max(0, (now - new Date(post.created_at).getTime()) / 3.6e6);
      const recency = 50 * Math.exp(-ageH / 72);                 // ~week-long decay
      const engagement = post.likes * 2 + post.comments * 4;
      const authorAff = likedAuthors.has(post.authorId) ? 25 : 0;
      const tagAff = extractTags(post.content).some((t) => likedTags.has(t)) ? 22 : 0;
      const media = post.type !== 'text' ? 6 : 0;
      const announce = post.is_announcement ? 35 : 0;            // your gym's notices float up
      const mine = post.mine ? -8 : 0;                           // your own posts sink a bit
      return { post, score: recency + engagement + authorAff + tagAff + media + announce + mine };
    }).sort((a, b) => b.score - a.score);

    const page = scored.slice(offset, offset + LIMIT).map((s) => s.post);
    const posts = await withSignedMedia(page);
    res.json({ posts, nextOffset: offset + LIMIT < scored.length ? offset + LIMIT : null });
  } catch (e) { next(e); }
});

// Posts containing a #hashtag — from the member's gym OR the public feed.
router.get('/tag/:tag', async (req, res, next) => {
  try {
    const tag = String(req.params.tag).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 50);
    if (!tag) return res.json({ posts: [], nextBefore: null });
    const oid = await orgId(req.user.id);
    const before = req.query.before ? Number(req.query.before) : null;
    // Match the hashtag as a whole token, case-insensitive (POSIX regex).
    const pattern = `(^|[^a-zA-Z0-9_])#${tag}([^a-zA-Z0-9_]|$)`;
    const rows = await q(
      `SELECT ${SEL} FROM posts p JOIN users u ON u.id=p.user_id LEFT JOIN organizations o ON o.id=p.org_id
       WHERE (p.org_id = $2 OR p.is_public = 1) AND p.content ~* $5
         AND ($3::int IS NULL OR p.id < $3) ORDER BY p.id DESC LIMIT $4`,
      [req.user.id, oid, before, PAGE + 1, pattern]
    );
    const hasMore = rows.length > PAGE;
    const page = rows.slice(0, PAGE);
    res.json({ posts: await withSignedMedia(page.map((r) => likeInfo(r, req.user.id))), nextBefore: hasMore ? page[page.length - 1].id : null });
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
    res.json({ posts: await withSignedMedia(page.map((r) => likeInfo(r, req.user.id))), nextBefore: hasMore ? page[page.length - 1].id : null });
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

// Emoji reaction (🔥💪👏❤️). Tapping the same one again removes it.
router.post('/:id/react', async (req, res, next) => {
  try {
    const reaction = REACTIONS.includes(req.body?.reaction) ? req.body.reaction : 'like';
    const existing = await one('SELECT reaction FROM post_likes WHERE post_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (existing && existing.reaction === reaction) {
      await one('DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2 RETURNING post_id', [req.params.id, req.user.id]);
    } else {
      await one(
        `INSERT INTO post_likes (post_id, user_id, reaction) VALUES ($1,$2,$3)
         ON CONFLICT (post_id, user_id) DO UPDATE SET reaction = $3 RETURNING post_id`,
        [req.params.id, req.user.id, reaction]
      );
    }
    const likes = (await one('SELECT COUNT(*) AS c FROM post_likes WHERE post_id = $1', [req.params.id]))?.c || 0;
    const mine = await one('SELECT reaction FROM post_likes WHERE post_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ likes, myReaction: mine?.reaction || null });
  } catch (e) { next(e); }
});

// Comments
router.get('/:id/comments', async (req, res, next) => {
  try {
    const comments = await q(
      `SELECT c.id, c.body, c.created_at, u.name AS author, c.user_id AS author_id,
              (u.avatar_path IS NOT NULL) AS author_avatar, (c.user_id = $2) AS mine
       FROM post_comments c JOIN users u ON u.id = c.user_id
       WHERE c.post_id = $1 ORDER BY c.id ASC`,
      [req.params.id, req.user.id]
    );
    res.json({ comments });
  } catch (e) { next(e); }
});

router.post('/:id/comments', async (req, res, next) => {
  try {
    const body = (req.body?.body || '').toString().trim();
    if (!body) return res.status(400).json({ error: 'Write a comment.' });
    const row = await one(
      'INSERT INTO post_comments (post_id, user_id, body) VALUES ($1,$2,$3) RETURNING id, body, created_at',
      [req.params.id, req.user.id, body.slice(0, 500)]
    );
    res.json({ comment: { ...row, author: 'You', mine: true } });
  } catch (e) { next(e); }
});

router.delete('/comments/:cid', async (req, res, next) => {
  try {
    await one('DELETE FROM post_comments WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.cid, req.user.id]);
    res.json({ ok: true });
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
