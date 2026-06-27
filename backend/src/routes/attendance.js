import { Router } from 'express';
import { db } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

function orgId(userId) {
  return db.prepare('SELECT org_id FROM users WHERE id = ?').get(userId)?.org_id;
}

// Check in to the gym (one open session at a time).
router.post('/checkin', (req, res) => {
  const open = db
    .prepare('SELECT * FROM attendance WHERE user_id = ? AND checked_out_at IS NULL ORDER BY id DESC LIMIT 1')
    .get(req.user.id);
  if (open) return res.json({ attendance: open, already: true });
  const info = db
    .prepare('INSERT INTO attendance (user_id, org_id) VALUES (?, ?)')
    .run(req.user.id, orgId(req.user.id));
  res.json({ attendance: db.prepare('SELECT * FROM attendance WHERE id = ?').get(info.lastInsertRowid) });
});

// Check out (close the open session). Optional { reason } for short sessions.
router.post('/checkout', (req, res) => {
  const open = db
    .prepare('SELECT * FROM attendance WHERE user_id = ? AND checked_out_at IS NULL ORDER BY id DESC LIMIT 1')
    .get(req.user.id);
  if (!open) return res.status(400).json({ error: 'You are not checked in.' });
  const reason = (req.body?.reason || '').toString().slice(0, 200) || null;
  db.prepare("UPDATE attendance SET checked_out_at = datetime('now'), reason = COALESCE(?, reason) WHERE id = ?")
    .run(reason, open.id);
  const row = db
    .prepare(
      `SELECT *, ROUND((julianday(checked_out_at)-julianday(checked_in_at))*1440) AS minutes
       FROM attendance WHERE id = ?`
    )
    .get(open.id);
  // Flag a too-short session (under 40 min) so the app can ask why.
  res.json({ attendance: row, durationMin: row.minutes, tooShort: row.minutes != null && row.minutes < 40 });
});

// Set/replace the reason on a session (used after a short checkout).
router.put('/:id/reason', (req, res) => {
  const reason = (req.body?.reason || '').toString().slice(0, 200);
  db.prepare('UPDATE attendance SET reason = ? WHERE id = ? AND user_id = ?').run(reason, req.params.id, req.user.id);
  res.json({ ok: true });
});

// My status + history + today's gym headcount + my streak.
router.get('/', (req, res) => {
  const open = db
    .prepare('SELECT * FROM attendance WHERE user_id = ? AND checked_out_at IS NULL ORDER BY id DESC LIMIT 1')
    .get(req.user.id);
  const history = db
    .prepare(
      `SELECT *, CASE WHEN checked_out_at IS NOT NULL
         THEN ROUND((julianday(checked_out_at)-julianday(checked_in_at))*1440) END AS minutes
       FROM attendance WHERE user_id = ? ORDER BY checked_in_at DESC LIMIT 30`
    )
    .all(req.user.id);
  const oid = orgId(req.user.id);
  const todayCount = db
    .prepare(
      `SELECT COUNT(DISTINCT user_id) AS c FROM attendance
       WHERE org_id = ? AND date(checked_in_at) = date('now','localtime')`
    )
    .get(oid)?.c || 0;
  const myVisits = db
    .prepare("SELECT COUNT(*) AS c FROM attendance WHERE user_id = ?")
    .get(req.user.id)?.c || 0;
  // distinct days this user attended (rough "sessions")
  const daysThisWeek = db
    .prepare(
      `SELECT COUNT(DISTINCT date(checked_in_at)) AS c FROM attendance
       WHERE user_id = ? AND checked_in_at >= datetime('now','-7 days')`
    )
    .get(req.user.id)?.c || 0;
  res.json({ checkedIn: !!open, open, history, todayCount, myVisits, daysThisWeek });
});

export default router;
