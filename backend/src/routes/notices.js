import { Router } from 'express';
import { db } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

function orgId(userId) {
  return db.prepare('SELECT org_id FROM users WHERE id = ?').get(userId)?.org_id;
}

function upsert(noticeId, userId, patch) {
  db.prepare('INSERT OR IGNORE INTO notice_responses (notice_id, user_id) VALUES (?, ?)').run(noticeId, userId);
  const keys = Object.keys(patch);
  if (keys.length) {
    db.prepare(`UPDATE notice_responses SET ${keys.map((k) => `${k}=@${k}`).join(', ')} WHERE notice_id=@nid AND user_id=@uid`)
      .run({ ...patch, nid: noticeId, uid: userId });
  }
}

// Active notices for my gym that I haven't dismissed (+ my response if any).
router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT n.id, n.title, n.body, n.type, n.created_at, r.response
       FROM notices n
       LEFT JOIN notice_responses r ON r.notice_id = n.id AND r.user_id = ?
       WHERE n.org_id = ? AND n.active = 1 AND COALESCE(r.dismissed,0) = 0
       ORDER BY n.created_at DESC`
    )
    .all(req.user.id, orgId(req.user.id));
  res.json({ notices: rows });
});

router.post('/:id/seen', (req, res) => {
  upsert(req.params.id, req.user.id, {});
  db.prepare("UPDATE notice_responses SET seen_at = COALESCE(seen_at, datetime('now')) WHERE notice_id=? AND user_id=?")
    .run(req.params.id, req.user.id);
  res.json({ ok: true });
});

router.post('/:id/dismiss', (req, res) => {
  upsert(req.params.id, req.user.id, {});
  db.prepare("UPDATE notice_responses SET dismissed = 1, seen_at = COALESCE(seen_at, datetime('now')) WHERE notice_id=? AND user_id=?")
    .run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// Respond (yes | no | ack). Also dismisses it from the user's home.
router.post('/:id/respond', (req, res) => {
  const response = ['yes', 'no', 'ack'].includes(req.body?.response) ? req.body.response : null;
  if (!response) return res.status(400).json({ error: 'invalid response' });
  upsert(req.params.id, req.user.id, {});
  db.prepare("UPDATE notice_responses SET response=?, responded_at=datetime('now'), dismissed=1, seen_at=COALESCE(seen_at,datetime('now')) WHERE notice_id=? AND user_id=?")
    .run(response, req.params.id, req.user.id);
  res.json({ ok: true });
});

export default router;
