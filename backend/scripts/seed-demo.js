// One-off: create/refresh a demo MEMBER with a week of realistic data so you can
// see the streak, calendar and progress charts populated.
//
// Run on the VM (DB reachable there):
//   docker compose exec api node backend/scripts/seed-demo.js
//
// Idempotent — re-running wipes this demo user's data and reseeds it.
import bcrypt from 'bcryptjs';
import { q, one, exec, pool } from '../src/db/index.js';

const GYM_SLUG = 'x-gym';
const EMAIL = 'demo@fithub.app';
const PASSWORD = 'Demo@123';
const NAME = 'Demo Member';

async function main() {
  const org = await one('SELECT id, name FROM organizations WHERE slug = $1', [GYM_SLUG]);
  if (!org) throw new Error(`Gym '${GYM_SLUG}' not found`);

  // Upsert the user.
  const hash = bcrypt.hashSync(PASSWORD, 10);
  let user = await one('SELECT id FROM users WHERE email = $1', [EMAIL]);
  if (user) {
    await exec('UPDATE users SET name=$2, password_hash=$3, role=$4, org_id=$5 WHERE id=$1',
      [user.id, NAME, hash, 'member', org.id]);
  } else {
    user = await one(
      'INSERT INTO users (email, name, password_hash, role, org_id) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [EMAIL, NAME, hash, 'member', org.id]);
  }
  const uid = user.id;

  // Clean prior demo data so re-runs stay tidy.
  await exec('DELETE FROM attendance WHERE user_id=$1', [uid]);
  await exec('DELETE FROM progress_logs WHERE user_id=$1', [uid]);
  await exec('DELETE FROM workouts WHERE user_id=$1', [uid]); // cascades to workout_sets
  await exec('DELETE FROM profiles WHERE user_id=$1', [uid]);

  // Profile with a target weight (drives the goal line on the weight chart).
  await exec(
    `INSERT INTO profiles (user_id, gender, age, height_cm, weight_kg, goal, activity_level, diet_pref, target_weight_kg, meals_per_day)
     VALUES ($1,'male',28,178,78,'lose_weight','moderate','veg',75,4)`,
    [uid]);

  // 7-day attendance streak (today + previous 6 days), ~70 min each.
  for (let k = 0; k < 7; k++) {
    await exec(
      `INSERT INTO attendance (user_id, org_id, checked_in_at, checked_out_at)
       VALUES ($1,$2, now() - make_interval(days => $3), now() - make_interval(days => $3) + interval '70 minutes')`,
      [uid, org.id, k]);
  }

  // Body-weight trend over ~14 days: 82 -> 78kg.
  const weights = [82, 81.6, 81.1, 80.6, 80.1, 79.6, 79.1, 78.7, 78.3, 78];
  for (let i = 0; i < weights.length; i++) {
    const daysAgo = 14 - Math.round((i / (weights.length - 1)) * 14);
    await exec(
      `INSERT INTO progress_logs (user_id, weight_kg, logged_at)
       VALUES ($1,$2, now() - make_interval(days => $3))`,
      [uid, weights[i], daysAgo]);
  }

  // 5 workouts over ~18 days with progressing Bench Press + Squat (for the
  // strength chart's estimated-1RM line).
  const sessions = [
    { daysAgo: 18, bench: 50, squat: 70 },
    { daysAgo: 14, bench: 52.5, squat: 75 },
    { daysAgo: 10, bench: 55, squat: 80 },
    { daysAgo: 6, bench: 57.5, squat: 85 },
    { daysAgo: 2, bench: 60, squat: 90 },
  ];
  for (const s of sessions) {
    const w = await one(
      `INSERT INTO workouts (user_id, org_id, title, created_at)
       VALUES ($1,$2,'Strength session', now() - make_interval(days => $3)) RETURNING id`,
      [uid, org.id, s.daysAgo]);
    const sets = [
      ['Bench Press', s.bench, 8, 1], ['Bench Press', s.bench, 8, 2], ['Bench Press', s.bench, 7, 3],
      ['Squat', s.squat, 5, 1], ['Squat', s.squat, 5, 2], ['Squat', s.squat, 5, 3],
    ];
    for (const [ex, wt, reps, no] of sets) {
      await exec(
        'INSERT INTO workout_sets (workout_id, user_id, exercise, weight_kg, reps, set_no) VALUES ($1,$2,$3,$4,$5,$6)',
        [w.id, uid, ex, wt, reps, no]);
    }
  }

  // A few peer members so the gym leaderboard looks alive (varying monthly visits).
  const peers = [
    { name: 'Priya', email: 'priya.demo@fithub.app', days: 12 },
    { name: 'Arjun', email: 'arjun.demo@fithub.app', days: 9 },
    { name: 'Rahul', email: 'rahul.demo@fithub.app', days: 6 },
    { name: 'Sneha', email: 'sneha.demo@fithub.app', days: 4 },
  ];
  for (const p of peers) {
    let pu = await one('SELECT id FROM users WHERE email = $1', [p.email]);
    if (!pu) {
      pu = await one('INSERT INTO users (email, name, password_hash, role, org_id) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [p.email, p.name, hash, 'member', org.id]);
    } else {
      await exec('UPDATE users SET org_id=$2 WHERE id=$1', [pu.id, org.id]);
    }
    await exec('DELETE FROM attendance WHERE user_id=$1', [pu.id]);
    // Check-ins on the first N days of this month (all in the past, distinct days).
    for (let k = 0; k < p.days; k++) {
      await exec(
        `INSERT INTO attendance (user_id, org_id, checked_in_at, checked_out_at)
         VALUES ($1,$2, date_trunc('month', current_date) + make_interval(days => $3) + interval '8 hours',
                       date_trunc('month', current_date) + make_interval(days => $3) + interval '9 hours')`,
        [pu.id, org.id, k]);
    }
  }

  // A lively community: posts + reactions + comments.
  const allEmails = [EMAIL, ...peers.map((p) => p.email)];
  await exec(`DELETE FROM posts WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))`, [allEmails]);
  const uid_of = async (email) => (await one('SELECT id, org_id FROM users WHERE email = $1', [email]));
  const mkPost = async (email, content) => {
    const u = await uid_of(email);
    return (await one(`INSERT INTO posts (user_id, org_id, type, content, is_public) VALUES ($1,$2,'text',$3,1) RETURNING id`, [u.id, u.org_id, content])).id;
  };
  const react = async (postId, email, reaction) => {
    const u = await uid_of(email);
    await exec(`INSERT INTO post_likes (post_id, user_id, reaction) VALUES ($1,$2,$3) ON CONFLICT (post_id, user_id) DO UPDATE SET reaction=$3`, [postId, u.id, reaction]);
  };
  const comment = async (postId, email, body) => {
    const u = await uid_of(email);
    await exec('INSERT INTO post_comments (post_id, user_id, body) VALUES ($1,$2,$3)', [postId, u.id, body]);
  };
  const p1 = await mkPost('priya.demo@fithub.app', 'Crushed it today 🔥 12-day streak going strong! Who is in tomorrow?');
  const p2 = await mkPost(EMAIL, 'Down 4kg this month 💪 the daily check-in streak really keeps me going.');
  const p3 = await mkPost('arjun.demo@fithub.app', 'Post-workout shake: banana + peanut butter + whey 🍌 try it!');
  await react(p1, EMAIL, 'fire'); await react(p1, 'arjun.demo@fithub.app', 'muscle'); await react(p1, 'rahul.demo@fithub.app', 'clap');
  await react(p2, 'priya.demo@fithub.app', 'clap'); await react(p2, 'sneha.demo@fithub.app', 'fire');
  await react(p3, EMAIL, 'fire');
  await comment(p1, EMAIL, 'Beast mode 👏'); await comment(p1, 'sneha.demo@fithub.app', "Let's go!");
  await comment(p2, 'arjun.demo@fithub.app', 'Great progress 🔥');

  console.log('\n✅ Demo member + 4 leaderboard peers + community posts seeded.');
  console.log('   Gym:      ' + org.name + '  (pick this on the org screen)');
  console.log('   Email:    ' + EMAIL);
  console.log('   Password: ' + PASSWORD);
  console.log('   Data: 7-day streak, 14 days of weight (82→78kg, goal 75), 5 strength sessions.\n');
  await pool.end();
  process.exit(0);
}

main().catch((e) => { console.error('Seed failed:', e); process.exit(1); });
