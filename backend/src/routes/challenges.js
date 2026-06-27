// Gym leaderboard / challenges — who's shown up the most. Community + virality,
// built from attendance (no AI). Members compete within their own gym.
import { Router } from 'express';
import { q, one } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

// GET /leaderboard?period=month|week  -> top members by distinct check-in days.
router.get('/leaderboard', async (req, res, next) => {
  try {
    const period = req.query.period === 'week' ? 'week' : 'month';
    const me = await one('SELECT org_id FROM users WHERE id = $1', [req.user.id]);
    if (!me?.org_id) return res.json({ period, leaderboard: [], me: null });

    const windowSql =
      period === 'week'
        ? "a.checked_in_at >= date_trunc('week', current_date)"
        : "date_trunc('month', a.checked_in_at) = date_trunc('month', current_date)";

    const rows = await q(
      `SELECT u.id, u.name, COUNT(DISTINCT a.checked_in_at::date) AS value
       FROM users u JOIN attendance a ON a.user_id = u.id
       WHERE u.org_id = $1 AND ${windowSql}
       GROUP BY u.id, u.name
       HAVING COUNT(DISTINCT a.checked_in_at::date) > 0
       ORDER BY value DESC, u.name ASC
       LIMIT 50`,
      [me.org_id]
    );

    const leaderboard = rows.map((r, i) => ({
      rank: i + 1,
      name: r.name,
      value: r.value,
      isMe: r.id === req.user.id,
    }));

    // My standing even if outside the top 50.
    const mine = leaderboard.find((r) => r.isMe);
    let meStanding = mine ? { rank: mine.rank, value: mine.value } : null;
    if (!meStanding) {
      const myVal = (await one(
        `SELECT COUNT(DISTINCT a.checked_in_at::date) AS value FROM attendance a
         WHERE a.user_id = $1 AND ${windowSql}`,
        [req.user.id]
      ))?.value || 0;
      const better = (await one(
        `SELECT COUNT(*) AS c FROM (
           SELECT u.id, COUNT(DISTINCT a.checked_in_at::date) AS value
           FROM users u JOIN attendance a ON a.user_id = u.id
           WHERE u.org_id = $1 AND ${windowSql}
           GROUP BY u.id HAVING COUNT(DISTINCT a.checked_in_at::date) > $2
         ) t`,
        [me.org_id, myVal]
      ))?.c || 0;
      meStanding = { rank: myVal > 0 ? better + 1 : null, value: myVal };
    }

    res.json({ period, leaderboard, me: meStanding });
  } catch (e) { next(e); }
});

export default router;
