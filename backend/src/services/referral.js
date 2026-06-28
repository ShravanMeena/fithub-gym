// Share & earn. Each user gets a referral code; new signups can enter a code,
// which awards the referrer coins and unlocks free Premium (AI) at milestones.
import { q, one, exec } from '../db/index.js';

export const COINS_PER_REFERRAL = 50;
// referrals reached -> free AI days granted (cumulative milestones)
export const MILESTONES = [
  { count: 3, days: 30, label: '1 month Premium' },
  { count: 5, days: 90, label: '3 months Premium' },
  { count: 10, days: 365, label: '1 year Premium' },
];

const rand = () => Math.random().toString(36).slice(2, 6).toUpperCase();

// Generate a unique referral code for a user (e.g. RAHUL7K2P).
export async function ensureReferralCode(userId) {
  const u = await one('SELECT name, referral_code FROM users WHERE id = $1', [userId]);
  if (!u) return null;
  if (u.referral_code) return u.referral_code;
  const base = (u.name || 'FIT').replace(/[^a-zA-Z]/g, '').slice(0, 5).toUpperCase() || 'FIT';
  for (let i = 0; i < 6; i++) {
    const code = base + rand();
    const clash = await one('SELECT 1 FROM users WHERE referral_code = $1', [code]);
    if (!clash) {
      await exec('UPDATE users SET referral_code = $1 WHERE id = $2', [code, userId]);
      return code;
    }
  }
  return null;
}

// Apply a referral code to a newly-created user. Awards the referrer.
export async function applyReferral(newUserId, code) {
  if (!code) return;
  const referrer = await one('SELECT id FROM users WHERE referral_code = $1', [code.trim().toUpperCase()]);
  if (!referrer || referrer.id === newUserId) return;

  await exec('UPDATE users SET referred_by = $1 WHERE id = $2 AND referred_by IS NULL', [referrer.id, newUserId]);
  await exec('UPDATE users SET coins = coins + $1 WHERE id = $2', [COINS_PER_REFERRAL, referrer.id]);

  // Milestone: grant free AI when the referrer hits a referral count.
  const count = (await one('SELECT COUNT(*) AS c FROM users WHERE referred_by = $1', [referrer.id]))?.c || 0;
  const m = MILESTONES.find((x) => x.count === count);
  if (m) {
    await exec(
      `UPDATE users SET ai_until = (CASE WHEN ai_until > now() THEN ai_until ELSE now() END) + make_interval(days => $1)
       WHERE id = $2`,
      [m.days, referrer.id]
    );
  }
}

export async function getReferralInfo(userId) {
  const code = await ensureReferralCode(userId);
  const u = await one('SELECT coins FROM users WHERE id = $1', [userId]);
  const count = (await one('SELECT COUNT(*) AS c FROM users WHERE referred_by = $1', [userId]))?.c || 0;
  const next = MILESTONES.find((m) => m.count > count) || null;
  return {
    code,
    coins: u?.coins || 0,
    referrals: count,
    coinsPerReferral: COINS_PER_REFERRAL,
    milestones: MILESTONES,
    next,
  };
}
