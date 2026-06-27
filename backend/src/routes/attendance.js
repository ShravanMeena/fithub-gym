import { Router } from 'express';
import { q, one } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

const orgId = async (userId) => (await one('SELECT org_id FROM users WHERE id = $1', [userId]))?.org_id;

router.post('/checkin', async (req, res, next) => {
  try {
    const open = await one('SELECT * FROM attendance WHERE user_id = $1 AND checked_out_at IS NULL ORDER BY id DESC LIMIT 1', [req.user.id]);
    if (open) return res.json({ attendance: open, already: true });
    const attendance = await one('INSERT INTO attendance (user_id, org_id) VALUES ($1,$2) RETURNING *', [req.user.id, await orgId(req.user.id)]);
    res.json({ attendance });
  } catch (e) { next(e); }
});

router.post('/checkout', async (req, res, next) => {
  try {
    const open = await one('SELECT * FROM attendance WHERE user_id = $1 AND checked_out_at IS NULL ORDER BY id DESC LIMIT 1', [req.user.id]);
    if (!open) return res.status(400).json({ error: 'You are not checked in.' });
    const reason = (req.body?.reason || '').toString().slice(0, 200) || null;
    const row = await one(
      `UPDATE attendance SET checked_out_at = now(), reason = COALESCE($1, reason)
       WHERE id = $2
       RETURNING *, ROUND(EXTRACT(EPOCH FROM (now() - checked_in_at)) / 60)::int AS minutes`,
      [reason, open.id]
    );
    res.json({ attendance: row, durationMin: row.minutes, tooShort: row.minutes != null && row.minutes < 40 });
  } catch (e) { next(e); }
});

router.put('/:id/reason', async (req, res, next) => {
  try {
    const reason = (req.body?.reason || '').toString().slice(0, 200);
    await one('UPDATE attendance SET reason = $1 WHERE id = $2 AND user_id = $3 RETURNING id', [reason, req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try {
    const open = await one('SELECT * FROM attendance WHERE user_id = $1 AND checked_out_at IS NULL ORDER BY id DESC LIMIT 1', [req.user.id]);
    const history = await q(
      `SELECT *, CASE WHEN checked_out_at IS NOT NULL
         THEN ROUND(EXTRACT(EPOCH FROM (checked_out_at - checked_in_at)) / 60)::int END AS minutes
       FROM attendance WHERE user_id = $1 ORDER BY checked_in_at DESC LIMIT 30`,
      [req.user.id]
    );
    const oid = await orgId(req.user.id);
    const todayCount = (await one(
      `SELECT COUNT(DISTINCT user_id) AS c FROM attendance WHERE org_id = $1 AND checked_in_at::date = current_date`,
      [oid]
    ))?.c || 0;
    const myVisits = (await one('SELECT COUNT(*) AS c FROM attendance WHERE user_id = $1', [req.user.id]))?.c || 0;
    const daysThisWeek = (await one(
      `SELECT COUNT(DISTINCT checked_in_at::date) AS c FROM attendance WHERE user_id = $1 AND checked_in_at >= now() - interval '7 days'`,
      [req.user.id]
    ))?.c || 0;
    res.json({ checkedIn: !!open, open, history, todayCount, myVisits, daysThisWeek });
  } catch (e) { next(e); }
});

// Streak + calendar + monthly leaderboard rank (all from attendance data).
router.get('/stats', async (req, res, next) => {
  try {
    const oid = await orgId(req.user.id);
    // Distinct check-in days over the last ~4 months (for streak + calendar).
    const rows = await q(
      `SELECT DISTINCT checked_in_at::date AS d FROM attendance
       WHERE user_id = $1 AND checked_in_at >= current_date - interval '120 days'
       ORDER BY d DESC`,
      [req.user.id]
    );
    const days = rows.map((r) => r.d); // 'YYYY-MM-DD' strings, newest first
    const set = new Set(days);

    // Current streak: consecutive days ending today (or yesterday if not yet in today).
    const iso = (dt) => dt.toISOString().slice(0, 10);
    const cur = new Date();
    if (!set.has(iso(cur))) cur.setUTCDate(cur.getUTCDate() - 1);
    let streak = 0;
    while (set.has(iso(cur))) { streak++; cur.setUTCDate(cur.getUTCDate() - 1); }

    // This-month visit count + rank within the gym (by distinct days visited).
    const rank = await one(
      `WITH mv AS (
         SELECT user_id, COUNT(DISTINCT checked_in_at::date) AS d
         FROM attendance
         WHERE org_id = $1 AND date_trunc('month', checked_in_at) = date_trunc('month', current_date)
         GROUP BY user_id
       )
       SELECT COALESCE((SELECT d FROM mv WHERE user_id = $2), 0) AS my_days,
              (SELECT COUNT(*) + 1 FROM mv WHERE d > COALESCE((SELECT d FROM mv WHERE user_id = $2), 0)) AS rank,
              (SELECT COUNT(*) FROM mv) AS ranked`,
      [oid, req.user.id]
    );

    res.json({
      streak,
      days,
      monthVisits: rank?.my_days || 0,
      rank: rank?.my_days > 0 ? rank.rank : null,
      rankedMembers: rank?.ranked || 0,
    });
  } catch (e) { next(e); }
});

export default router;
