// "This week" scorecard — the one-glance answer to "am I on track?".
import { Router } from 'express';
import { q, one } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { computeStreaks } from './attendance.js';

const router = Router();
router.use(authRequired);

router.get('/week', async (req, res, next) => {
  try {
    const uid = req.user.id;
    const sessions = (await one(
      `SELECT COUNT(DISTINCT checked_in_at::date) AS c FROM attendance WHERE user_id = $1 AND checked_in_at >= now() - interval '7 days'`,
      [uid]
    ))?.c || 0;
    const foodDays = (await one(
      `SELECT COUNT(DISTINCT eaten_at::date) AS c FROM food_logs WHERE user_id = $1 AND eaten_at >= now() - interval '7 days'`,
      [uid]
    ))?.c || 0;
    const w = await q(
      `SELECT weight_kg FROM progress_logs WHERE user_id = $1 AND weight_kg IS NOT NULL AND logged_at >= now() - interval '35 days' ORDER BY logged_at ASC`,
      [uid]
    );
    const weightChangeKg = w.length >= 2 ? Number(w[w.length - 1].weight_kg) - Number(w[0].weight_kg) : null;

    const ci = await q(`SELECT DISTINCT checked_in_at::date AS d FROM attendance WHERE user_id = $1 AND checked_in_at >= current_date - interval '220 days'`, [uid]);
    const rd = await q(`SELECT day FROM rest_days WHERE user_id = $1 AND day >= current_date - interval '220 days'`, [uid]);
    const { streak } = computeStreaks(new Set(ci.map((r) => r.d)), new Set(rd.map((r) => r.day)));

    res.json({ sessions, foodDays, weightChangeKg, streak, targetSessions: 4 });
  } catch (e) { next(e); }
});

// Collectible badges, computed from the member's own data.
const BADGES = [
  { key: 'streak7', emoji: '🔥', label: '7-Day Streak', desc: 'Checked in 7 days in a row' },
  { key: 'streak30', emoji: '🏅', label: '30-Day Streak', desc: 'A full month, never missed' },
  { key: 'streak100', emoji: '👑', label: '100-Day Streak', desc: 'Legendary consistency' },
  { key: 'sessions10', emoji: '💪', label: '10 Sessions', desc: '10 gym visits logged' },
  { key: 'sessions50', emoji: '🦾', label: '50 Sessions', desc: '50 gym visits logged' },
  { key: 'diet7', emoji: '🍗', label: 'Diet Dialed', desc: 'Logged food on 7 days' },
  { key: 'water5', emoji: '💧', label: 'Hydrated', desc: 'Hit your water goal 5 times' },
  { key: 'photo1', emoji: '📸', label: 'First Photo', desc: 'Added a progress photo' },
  { key: 'weight3', emoji: '⚖️', label: 'Transformation', desc: 'Moved 3kg toward your goal' },
  { key: 'invite1', emoji: '🎁', label: 'Recruiter', desc: 'Invited a friend' },
  { key: 'invite5', emoji: '📣', label: 'Influencer', desc: 'Invited 5 friends' },
];

router.get('/badges', async (req, res, next) => {
  try {
    const uid = req.user.id;
    const ci = await q(`SELECT DISTINCT checked_in_at::date AS d FROM attendance WHERE user_id = $1 AND checked_in_at >= current_date - interval '400 days'`, [uid]);
    const rd = await q(`SELECT day FROM rest_days WHERE user_id = $1 AND day >= current_date - interval '400 days'`, [uid]);
    const { longest } = computeStreaks(new Set(ci.map((r) => r.d)), new Set(rd.map((r) => r.day)));
    const sessions = (await one('SELECT COUNT(DISTINCT checked_in_at::date) AS c FROM attendance WHERE user_id = $1', [uid]))?.c || 0;
    const foodDays = (await one('SELECT COUNT(DISTINCT eaten_at::date) AS c FROM food_logs WHERE user_id = $1', [uid]))?.c || 0;
    const waterHit = (await one('SELECT COUNT(*) AS c FROM water_intake w JOIN users u ON u.id = w.user_id WHERE w.user_id = $1 AND w.ml >= u.water_goal_ml', [uid]))?.c || 0;
    const photos = (await one('SELECT COUNT(*) AS c FROM progress_photos WHERE user_id = $1', [uid]))?.c || 0;
    const referrals = (await one('SELECT COUNT(*) AS c FROM users WHERE referred_by = $1', [uid]))?.c || 0;
    const wr = await q('SELECT weight_kg FROM progress_logs WHERE user_id = $1 AND weight_kg IS NOT NULL ORDER BY logged_at ASC', [uid]);
    const weightMove = wr.length >= 2 ? Math.abs(Number(wr[wr.length - 1].weight_kg) - Number(wr[0].weight_kg)) : 0;

    const earned = {
      streak7: longest >= 7, streak30: longest >= 30, streak100: longest >= 100,
      sessions10: sessions >= 10, sessions50: sessions >= 50,
      diet7: foodDays >= 7, water5: waterHit >= 5, photo1: photos >= 1,
      weight3: weightMove >= 3, invite1: referrals >= 1, invite5: referrals >= 5,
    };
    const badges = BADGES.map((b) => ({ ...b, earned: !!earned[b.key] }));
    res.json({ badges, earnedCount: badges.filter((b) => b.earned).length, total: badges.length });
  } catch (e) { next(e); }
});

// This month's gym-wide check-in challenge (computed — everyone's in, no join).
router.get('/challenge', async (req, res, next) => {
  try {
    const uid = req.user.id;
    const goal = 15; // check-ins this calendar month
    const mine = (await one(
      `SELECT COUNT(DISTINCT checked_in_at::date) AS c FROM attendance WHERE user_id = $1 AND date_trunc('month', checked_in_at) = date_trunc('month', current_date)`,
      [uid]
    ))?.c || 0;
    const oid = (await one('SELECT org_id FROM users WHERE id = $1', [uid]))?.org_id;
    const finishers = (await one(
      `SELECT COUNT(*) AS c FROM (
         SELECT user_id FROM attendance
         WHERE org_id = $1 AND date_trunc('month', checked_in_at) = date_trunc('month', current_date)
         GROUP BY user_id HAVING COUNT(DISTINCT checked_in_at::date) >= $2
       ) t`,
      [oid, goal]
    ))?.c || 0;
    res.json({ title: 'Monthly Check-in Challenge', goal, mine, done: mine >= goal, finishers });
  } catch (e) { next(e); }
});

export default router;
