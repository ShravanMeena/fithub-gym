import { db } from '../db/index.js';

// True if the user currently has an active AI subscription.
export function hasAiAccess(userId) {
  const row = db
    .prepare("SELECT (ai_until IS NOT NULL AND ai_until > datetime('now')) AS active FROM users WHERE id = ?")
    .get(userId);
  return !!row?.active;
}

// Gate for AI-powered endpoints. Returns 402 with code AI_LOCKED if not subscribed.
export function aiRequired(req, res, next) {
  if (!hasAiAccess(req.user.id)) {
    return res.status(402).json({ error: 'AI access required. Subscribe to unlock.', code: 'AI_LOCKED' });
  }
  next();
}
