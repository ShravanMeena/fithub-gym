// Device push-token registration. The app calls POST /register after it gets
// an FCM token (on login / app open), and /unregister on logout.
import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { exec, one } from '../db/index.js';

const router = Router();
router.use(authRequired);

// Register (or refresh) the caller's device token. Upsert keyed on token so a
// device that re-logs-in as another user is reassigned cleanly.
router.post('/register', async (req, res, next) => {
  try {
    const { token, platform } = req.body || {};
    if (!token) return res.status(400).json({ error: 'token required' });

    // Prefer an org from the body; fall back to the user's own org.
    let orgId = req.body?.orgId || null;
    if (!orgId) {
      const u = await one('SELECT org_id FROM users WHERE id = $1', [req.user.id]);
      orgId = u?.org_id || null;
    }

    await exec(
      `INSERT INTO device_tokens (token, user_id, org_id, platform, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (token) DO UPDATE
         SET user_id = EXCLUDED.user_id,
             org_id = EXCLUDED.org_id,
             platform = EXCLUDED.platform,
             updated_at = now()`,
      [token, req.user.id, orgId, platform || null]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/unregister', async (req, res, next) => {
  try {
    const { token } = req.body || {};
    if (token) await exec('DELETE FROM device_tokens WHERE token = $1', [token]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
