// ⚠️ DESTRUCTIVE: wipes ALL gyms + users (keeps the platform superadmin) and
// seeds fresh data — two gyms (A Gym, Z Gym) and 10 members with profiles,
// attendance, referral codes and a few community posts.
//
// Run on the VM:  docker compose exec api node backend/scripts/reset-seed.js
import bcrypt from 'bcryptjs';
import { q, one, exec, pool } from '../src/db/index.js';
import { ensureReferralCode } from '../src/services/referral.js';

const PASSWORD = 'Test@123';

const USERS = [
  // A Gym
  { gym: 'a-gym', name: 'Aman Verma',  email: 'aman@agym.com',  role: 'admin',  days: 10, w: 82, t: 76, goal: 'lose_fat' },
  { gym: 'a-gym', name: 'Priya Sharma', email: 'priya@agym.com', role: 'member', days: 14, w: 64, t: 60, goal: 'lose_fat' },
  { gym: 'a-gym', name: 'Rahul Singh',  email: 'rahul@agym.com', role: 'member', days: 8,  w: 78, t: 84, goal: 'build_muscle' },
  { gym: 'a-gym', name: 'Sneha Patel',  email: 'sneha@agym.com', role: 'member', days: 5,  w: 70, t: 65, goal: 'lose_fat' },
  { gym: 'a-gym', name: 'Vikram Rao',   email: 'vikram@agym.com', role: 'member', days: 3, w: 90, t: 80, goal: 'lose_fat' },
  // Z Gym
  { gym: 'z-gym', name: 'Zara Khan',    email: 'zara@zgym.com',  role: 'admin',  days: 12, w: 60, t: 58, goal: 'maintain' },
  { gym: 'z-gym', name: 'Karan Mehta',  email: 'karan@zgym.com', role: 'member', days: 9,  w: 85, t: 90, goal: 'build_muscle' },
  { gym: 'z-gym', name: 'Neha Gupta',   email: 'neha@zgym.com',  role: 'member', days: 6,  w: 68, t: 62, goal: 'lose_fat' },
  { gym: 'z-gym', name: 'Arjun Nair',   email: 'arjun@zgym.com', role: 'member', days: 4,  w: 75, t: 80, goal: 'build_muscle' },
  { gym: 'z-gym', name: 'Divya Iyer',   email: 'divya@zgym.com', role: 'member', days: 2,  w: 58, t: 55, goal: 'lose_fat' },
];

async function main() {
  console.log('⚠️  Wiping all gyms + users (keeping superadmin)…');
  await exec("DELETE FROM users WHERE role != 'superadmin'"); // cascades attendance/posts/etc.
  await exec("DELETE FROM organizations WHERE slug NOT IN ('a-gym','z-gym')");

  const hash = bcrypt.hashSync(PASSWORD, 10);
  const orgs = {};
  for (const slug of ['a-gym', 'z-gym']) {
    orgs[slug] = (await one('SELECT id FROM organizations WHERE slug = $1', [slug]))?.id;
    if (!orgs[slug]) throw new Error(`Gym ${slug} missing — start the server once so initDb seeds it.`);
  }

  for (const u of USERS) {
    const row = await one(
      `INSERT INTO users (email, name, password_hash, role, org_id, phone)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [u.email, u.name, hash, u.role, orgs[u.gym], '90000000' + String(10 + USERS.indexOf(u))]
    );
    const uid = row.id;
    await ensureReferralCode(uid);
    // Give each seed user an active 7-day Premium trial (so AI works for testing).
    await exec("UPDATE users SET ai_until = now() + interval '7 days' WHERE id = $1", [uid]);

    // Profile
    await exec(
      `INSERT INTO profiles (user_id, gender, age, height_cm, weight_kg, goal, activity_level, diet_pref, target_weight_kg, meals_per_day)
       VALUES ($1,'other',27,172,$2,$3,'moderate','veg',$4,4)`,
      [uid, u.w, u.goal, u.t]
    );

    // Attendance: `days` consecutive check-ins ending today (streak + leaderboard).
    for (let k = 0; k < u.days; k++) {
      await exec(
        `INSERT INTO attendance (user_id, org_id, checked_in_at, checked_out_at)
         VALUES ($1,$2, now() - make_interval(days => $3), now() - make_interval(days => $3) + interval '70 minutes')`,
        [uid, orgs[u.gym], k]
      );
    }

    // A weight history so Progress charts have data.
    for (let i = 0; i < 6; i++) {
      const wt = u.goal === 'build_muscle' ? u.w + i * 0.4 : u.w - i * 0.5;
      await exec(
        `INSERT INTO progress_logs (user_id, weight_kg, waist_cm, logged_at)
         VALUES ($1,$2,$3, now() - make_interval(days => $4))`,
        [uid, Math.round(wt * 10) / 10, 90 - i, (5 - i) * 5]
      );
    }
  }

  // A couple of community posts per gym (by the first member of each).
  const post = async (email, content) => {
    const u = await one('SELECT id, org_id FROM users WHERE email = $1', [email]);
    await exec(`INSERT INTO posts (user_id, org_id, type, content, is_public) VALUES ($1,$2,'text',$3,1)`, [u.id, u.org_id, content]);
  };
  await post('priya@agym.com', 'Day 14 of my streak at A Gym 🔥 feeling unstoppable!');
  await post('rahul@agym.com', 'New PB on bench today 💪 who else is training this evening?');
  await post('zara@zgym.com', 'Welcome to Z Gym fam 👋 drop your goals below!');
  await post('karan@zgym.com', 'Morning leg day done ✅ Z Gym energy is unmatched.');

  console.log('\n✅ Fresh data seeded.\n');
  console.log('Gyms: A Gym, Z Gym');
  console.log('All passwords: ' + PASSWORD + '\n');
  console.log('ADMINS (admin.html):');
  console.log('  A Gym  → aman@agym.com');
  console.log('  Z Gym  → zara@zgym.com');
  console.log('MEMBERS (app): priya@agym.com, rahul@agym.com, sneha@agym.com, vikram@agym.com,');
  console.log('               karan@zgym.com, neha@zgym.com, arjun@zgym.com, divya@zgym.com');
  await pool.end();
  process.exit(0);
}

main().catch((e) => { console.error('Reset failed:', e); process.exit(1); });
