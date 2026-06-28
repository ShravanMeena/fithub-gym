// Platform-wide key/value settings (superadmin-managed).
import { one, exec } from '../db/index.js';

export async function getSetting(key, def = null) {
  const r = await one('SELECT value FROM platform_settings WHERE key = $1', [key]);
  return r ? r.value : def;
}

export async function setSetting(key, value) {
  await exec(
    `INSERT INTO platform_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = $2`,
    [key, String(value)]
  );
}

// Free-trial length in days for new signups (default 7).
export async function getTrialDays() {
  const v = await getSetting('trial_days', '7');
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : 7;
}
