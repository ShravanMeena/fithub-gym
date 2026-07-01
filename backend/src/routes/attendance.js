import { Router } from 'express';
import { q, one } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

const orgId = async (userId) => (await one('SELECT org_id FROM users WHERE id = $1', [userId]))?.org_id;

// If this check-in pushed the user past a new streak milestone, auto-post a
// celebration to their gym feed (and return the milestone). Won't repeat.
async function celebrateStreakMilestone(userId) {
  const ci = await q(`SELECT DISTINCT checked_in_at::date AS d FROM attendance WHERE user_id = $1 AND checked_in_at >= current_date - interval '220 days'`, [userId]);
  const checkins = new Set(ci.map((r) => r.d));
  const rd = await q(`SELECT day FROM rest_days WHERE user_id = $1 AND day >= current_date - interval '220 days'`, [userId]);
  const { streak } = computeStreaks(checkins, new Set(rd.map((r) => r.day)));
  const u = await one('SELECT name, org_id, last_streak_milestone FROM users WHERE id = $1', [userId]);
  if (!u) return null;
  const m = [...MILESTONES].reverse().find((x) => streak >= x && x > (u.last_streak_milestone || 0));
  if (!m) return null;
  await one('UPDATE users SET last_streak_milestone = $2 WHERE id = $1 RETURNING id', [userId, m]);
  await one(
    `INSERT INTO posts (user_id, org_id, type, content, is_public, is_announcement) VALUES ($1,$2,'text',$3,1,0) RETURNING id`,
    [userId, u.org_id, `🔥 ${u.name} just hit a ${streak}-day check-in streak! Keep it going 💪`]
  );
  return m;
}

router.post('/checkin', async (req, res, next) => {
  try {
    const open = await one('SELECT * FROM attendance WHERE user_id = $1 AND checked_out_at IS NULL ORDER BY id DESC LIMIT 1', [req.user.id]);
    if (open) return res.json({ attendance: open, already: true });
    const attendance = await one('INSERT INTO attendance (user_id, org_id) VALUES ($1,$2) RETURNING *', [req.user.id, await orgId(req.user.id)]);
    const milestone = await celebrateStreakMilestone(req.user.id).catch(() => null);
    res.json({ attendance, milestone });
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

// Save what the member trained this session (array of muscle groups).
router.put('/:id/focus', async (req, res, next) => {
  try {
    const list = Array.isArray(req.body?.focus) ? req.body.focus : [];
    const focus = list.map((s) => String(s).slice(0, 24)).filter(Boolean).slice(0, 10).join(', ') || null;
    await one('UPDATE attendance SET focus = $1 WHERE id = $2 AND user_id = $3 RETURNING id', [focus, req.params.id, req.user.id]);
    res.json({ ok: true, focus });
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
    // Completed at least one session today? Used to avoid re-prompting check-in.
    const doneToday = await one(
      `SELECT id FROM attendance WHERE user_id = $1 AND checked_out_at IS NOT NULL AND checked_in_at::date = current_date ORDER BY id DESC LIMIT 1`,
      [req.user.id]
    );
    res.json({ checkedIn: !!open, open, history, todayCount, myVisits, daysThisWeek, checkedOutToday: !!doneToday });
  } catch (e) { next(e); }
});

export const MILESTONES = [7, 14, 30, 50, 100, 200, 365];
const REST_PER_MONTH = 4;

// Compute current + longest streak, where a marked rest day bridges (protects)
// the streak instead of breaking it. checkins/rests are Sets of 'YYYY-MM-DD'.
export function computeStreaks(checkins, rests) {
  const iso = (dt) => dt.toISOString().slice(0, 10);
  // Current streak: walk back from today; today empty (not yet) is allowed.
  let streak = 0;
  const d = new Date();
  for (let i = 0; i < 220; i++) {
    const key = iso(d);
    if (checkins.has(key)) streak++;
    else if (rests.has(key)) { /* bridge */ }
    else if (i > 0) break; // a real gap (not today) ends the streak
    d.setUTCDate(d.getUTCDate() - 1);
  }
  // Longest streak: walk forward over the window, bridging rest days.
  let run = 0, longest = 0;
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 219);
  for (let i = 0; i < 220; i++) {
    const key = iso(start);
    if (checkins.has(key)) { run++; if (run > longest) longest = run; }
    else if (rests.has(key)) { /* bridge */ }
    else run = 0;
    start.setUTCDate(start.getUTCDate() + 1);
  }
  return { streak, longest };
}

// Streak + calendar + leaderboard rank + milestones + rest-day budget.
router.get('/stats', async (req, res, next) => {
  try {
    const oid = await orgId(req.user.id);
    const rows = await q(
      `SELECT DISTINCT checked_in_at::date AS d FROM attendance
       WHERE user_id = $1 AND checked_in_at >= current_date - interval '220 days'
       ORDER BY d DESC`,
      [req.user.id]
    );
    const days = rows.map((r) => r.d);
    const checkins = new Set(days);
    const restRows = await q(
      `SELECT day FROM rest_days WHERE user_id = $1 AND day >= current_date - interval '220 days'`,
      [req.user.id]
    );
    const rests = new Set(restRows.map((r) => r.day));

    const { streak, longest } = computeStreaks(checkins, rests);

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

    const restUsed = (await one(
      `SELECT COUNT(*) AS c FROM rest_days WHERE user_id = $1 AND date_trunc('month', day) = date_trunc('month', current_date)`,
      [req.user.id]
    ))?.c || 0;

    const today = new Date().toISOString().slice(0, 10);
    const earned = MILESTONES.filter((m) => longest >= m);
    const nextMilestone = MILESTONES.find((m) => m > streak) || null;

    res.json({
      streak,
      longest,
      days,
      restDays: [...rests],
      restToday: rests.has(today),
      restUsed,
      restRemaining: Math.max(0, REST_PER_MONTH - restUsed),
      checkedInToday: checkins.has(today),
      milestones: earned,
      nextMilestone,
      monthVisits: rank?.my_days || 0,
      rank: rank?.my_days > 0 ? rank.rank : null,
      rankedMembers: rank?.ranked || 0,
    });
  } catch (e) { next(e); }
});

// Mark (or unmark) today as a planned rest day, protecting the streak. Capped
// per month. Can't rest on a day you actually checked in.
router.post('/rest', async (req, res, next) => {
  try {
    const existing = await one('SELECT 1 FROM rest_days WHERE user_id = $1 AND day = current_date', [req.user.id]);
    if (existing) {
      await one('DELETE FROM rest_days WHERE user_id = $1 AND day = current_date RETURNING day', [req.user.id]);
      return res.json({ rest: false });
    }
    const checkedIn = await one(`SELECT 1 FROM attendance WHERE user_id = $1 AND checked_in_at::date = current_date`, [req.user.id]);
    if (checkedIn) return res.status(400).json({ error: "You already checked in today — no rest day needed!" });
    const used = (await one(
      `SELECT COUNT(*) AS c FROM rest_days WHERE user_id = $1 AND date_trunc('month', day) = date_trunc('month', current_date)`,
      [req.user.id]
    ))?.c || 0;
    if (used >= REST_PER_MONTH) return res.status(400).json({ error: `Only ${REST_PER_MONTH} rest days a month — none left.` });
    await one('INSERT INTO rest_days (user_id, day) VALUES ($1, current_date) ON CONFLICT DO NOTHING RETURNING day', [req.user.id]);
    res.json({ rest: true });
  } catch (e) { next(e); }
});

export default router;
