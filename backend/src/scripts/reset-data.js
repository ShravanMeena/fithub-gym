// ⚠️  DANGER — wipes ALL user data to start fresh (launch reset).
//
// Deletes every row from every table EXCEPT the keep-list below:
//   • organizations   (your gyms)
//   • platform_settings (trial days, daily messages, etc.)
//   • app_update       (force/soft update config)
//
// Everything else — users and ALL their records (attendance, food logs, posts,
// photos, chat, diet plans, PRs, progress, early-access signups, analytics,
// api logs, …) — is truncated and ids reset to 1. IRREVERSIBLE. Back up first.
//
// After running, RESTART the backend so it re-seeds the superadmin account.
//
// Run (must pass --yes to actually wipe):
//   docker compose exec api node src/scripts/reset-data.js --yes
//   (or)  node backend/src/scripts/reset-data.js --yes
import 'dotenv/config';
import { pool } from '../db/index.js';

const KEEP = new Set(['organizations', 'platform_settings', 'app_update']);
const CONFIRMED = process.argv.includes('--yes') || process.env.RESET_CONFIRM === 'YES';

async function main() {
  const { rows } = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
  const targets = rows.map((r) => r.tablename).filter((t) => !KEEP.has(t));

  const before = await pool.query('SELECT COUNT(*)::int AS c FROM users').catch(() => ({ rows: [{ c: '?' }] }));
  console.log(`\nCurrent users in DB: ${before.rows[0].c}`);
  console.log(`Will TRUNCATE ${targets.length} tables (keeping: ${[...KEEP].join(', ')}):`);
  console.log('  ' + targets.join(', ') + '\n');

  if (!CONFIRMED) {
    console.log('❌ DRY RUN — nothing deleted. Re-run with  --yes  to actually wipe everything.\n');
    await pool.end();
    return;
  }

  console.log('⚠️  Wiping all user data now…');
  const list = targets.map((t) => `"${t}"`).join(', ');
  await pool.query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);

  const after = await pool.query('SELECT COUNT(*)::int AS c FROM users');
  console.log(`✅ Done. Users now: ${after.rows[0].c}. Gyms/settings/update-config kept.`);
  console.log('👉 Restart the backend (docker compose restart api) to re-seed the superadmin account.\n');
  await pool.end();
}

main().catch((e) => { console.error('Reset failed:', e); process.exit(1); });
