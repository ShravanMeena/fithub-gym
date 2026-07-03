// Public app-update check. The app calls this on launch with its platform +
// version; the server decides whether to show a soft or force update card.
// Content (title/message/button/url) is fully dynamic, managed by superadmin.
import { Router } from 'express';
import { one } from '../db/index.js';

const router = Router();

// Compare two dotted version strings numerically. Returns -1, 0, or 1.
function cmpVersion(a, b) {
  const pa = String(a).split(/[^\d]+/).filter(Boolean).map(Number);
  const pb = String(b).split(/[^\d]+/).filter(Boolean).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

// GET /api/app/update?platform=ios|android&version=1.0
router.get('/update', async (req, res, next) => {
  try {
    const platform = req.query.platform === 'ios' ? 'ios' : 'android';
    const version = (req.query.version || '0').toString();
    const cfg = await one('SELECT * FROM app_update WHERE platform = $1', [platform]);

    if (!cfg || !cfg.enabled) return res.json({ update: false });

    // Parse the comma/space-separated explicit version lists.
    const list = (s) => String(s || '').split(/[,\s]+/).map((v) => v.trim()).filter(Boolean);
    const forceList = list(cfg.force_versions);
    const softList = list(cfg.soft_versions);

    let type = 'none';
    // Explicit per-version targeting wins over the thresholds (except the enabled kill-switch).
    if (forceList.includes(version)) type = 'force';
    else if (softList.includes(version)) type = 'soft';
    else if (cfg.mode === 'force') type = 'force';
    else if (cfg.mode === 'soft') type = 'soft';
    else if (cfg.mode === 'off') type = 'none';
    else {
      // auto: below min => force, below latest => soft
      if (cfg.min_version && cmpVersion(version, cfg.min_version) < 0) type = 'force';
      else if (cfg.latest_version && cmpVersion(version, cfg.latest_version) < 0) type = 'soft';
    }

    if (type === 'none') return res.json({ update: false });

    res.json({
      update: true,
      force: type === 'force',
      title: cfg.title,
      message: cfg.message,
      button_text: cfg.button_text,
      download_url: cfg.download_url,
      latest_version: cfg.latest_version,
    });
  } catch (e) { next(e); }
});

export default router;
