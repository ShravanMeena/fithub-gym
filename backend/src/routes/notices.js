import { Router } from 'express';
import { q, one } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

const orgId = async (userId) => (await one('SELECT org_id FROM users WHERE id = $1', [userId]))?.org_id;

router.get('/', async (req, res, next) => {
  try {
    const notices = await q(
      `SELECT n.id, n.title, n.body, n.type, n.created_at, r.response
       FROM notices n LEFT JOIN notice_responses r ON r.notice_id = n.id AND r.user_id = $1
       WHERE n.org_id = $2 AND n.active = 1 AND COALESCE(r.dismissed, 0) = 0
       ORDER BY n.created_at DESC`,
      [req.user.id, await orgId(req.user.id)]
    );
    res.json({ notices });
  } catch (e) { next(e); }
});

router.post('/:id/seen', async (req, res, next) => {
  try {
    await one(
      `INSERT INTO notice_responses (notice_id, user_id, seen_at) VALUES ($1,$2,now())
       ON CONFLICT (notice_id, user_id) DO UPDATE SET seen_at = COALESCE(notice_responses.seen_at, now()) RETURNING notice_id`,
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/:id/dismiss', async (req, res, next) => {
  try {
    await one(
      `INSERT INTO notice_responses (notice_id, user_id, dismissed, seen_at) VALUES ($1,$2,1,now())
       ON CONFLICT (notice_id, user_id) DO UPDATE SET dismissed = 1, seen_at = COALESCE(notice_responses.seen_at, now()) RETURNING notice_id`,
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/:id/respond', async (req, res, next) => {
  try {
    const response = ['yes', 'no', 'ack'].includes(req.body?.response) ? req.body.response : null;
    if (!response) return res.status(400).json({ error: 'invalid response' });
    await one(
      `INSERT INTO notice_responses (notice_id, user_id, response, responded_at, dismissed, seen_at)
       VALUES ($1,$2,$3,now(),1,now())
       ON CONFLICT (notice_id, user_id)
       DO UPDATE SET response = $3, responded_at = now(), dismissed = 1, seen_at = COALESCE(notice_responses.seen_at, now()) RETURNING notice_id`,
      [req.params.id, req.user.id, response]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
