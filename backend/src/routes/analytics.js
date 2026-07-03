// Lightweight event tracking. The app posts a few key events (app opens, paywall
// views); everything else is derived from existing tables in the dashboard.
import { Router } from 'express';
import { exec } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

const ALLOWED = new Set(['app_open', 'paywall_shown', 'food_scan', 'share_progress']);

router.post('/track', async (req, res) => {
  try {
    const event = String(req.body?.event || '').slice(0, 40);
    if (!ALLOWED.has(event)) return res.json({ ok: true });
    await exec(
      'INSERT INTO analytics_events (user_id, org_id, event) VALUES ($1, (SELECT org_id FROM users WHERE id = $1), $2)',
      [req.user.id, event]
    );
    res.json({ ok: true });
  } catch {
    res.json({ ok: false }); // analytics must never break the app
  }
});

export default router;
