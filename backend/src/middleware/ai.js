import { one } from '../db/index.js';

// True if the user currently has an active AI subscription.
export async function hasAiAccess(userId) {
  const row = await one(
    "SELECT (ai_until IS NOT NULL AND ai_until > now()) AS active FROM users WHERE id = $1",
    [userId]
  );
  return !!row?.active;
}

// Gate for AI-powered endpoints. 402 with code AI_LOCKED if not subscribed.
export async function aiRequired(req, res, next) {
  try {
    if (!(await hasAiAccess(req.user.id))) {
      return res.status(402).json({ error: 'AI access required. Subscribe to unlock.', code: 'AI_LOCKED' });
    }
    next();
  } catch (e) { next(e); }
}
