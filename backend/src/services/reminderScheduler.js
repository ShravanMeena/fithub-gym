// Server-side reminder delivery. Every minute we find reminders whose local
// time (hour:minute in the user's timezone) matches "now" and push them via FCM
// to that user's devices. Replaces the app's old on-device scheduling.
//
// A reminder stores `tz_offset` (minutes ahead of UTC). local-minute-of-day =
// (utcMinuteOfDay + tz_offset) wrapped into [0,1440). `last_pushed_at` debounces
// so a reminder fires at most once per minute even if the tick drifts.
import { q, exec } from '../db/index.js';
import { pushEnabled, sendToUser, sendToTokens } from './push.js';

let timer = null;

const STREAK_SAVER_LOCAL_MIN = 19 * 60; // 7:00 PM local time

// Nudge members who checked in yesterday (local) but not yet today, so they
// don't break their streak. Runs once per timezone bucket at 7pm local.
async function streakSaver(utcMin) {
  const tzRows = await q('SELECT DISTINCT tz_offset FROM device_tokens');
  for (const { tz_offset: tz } of tzRows) {
    const localMin = (((utcMin + tz) % 1440) + 1440) % 1440;
    if (localMin !== STREAK_SAVER_LOCAL_MIN) continue;
    // Candidates: have a device in this tz, checked in yesterday (local) but not today.
    const rows = await q(
      `SELECT DISTINCT dt.token
       FROM device_tokens dt
       WHERE dt.tz_offset = $1
         AND EXISTS (
           SELECT 1 FROM attendance a WHERE a.user_id = dt.user_id
             AND (a.checked_in_at + make_interval(mins => $1))::date = ((now() + make_interval(mins => $1))::date - 1)
         )
         AND NOT EXISTS (
           SELECT 1 FROM attendance a WHERE a.user_id = dt.user_id
             AND (a.checked_in_at + make_interval(mins => $1))::date = (now() + make_interval(mins => $1))::date
         )`,
      [tz]
    );
    if (rows.length) {
      await sendToTokens(rows.map((r) => r.token), {
        title: '🔥 Keep your streak alive!',
        body: "You haven't checked in today — a quick session keeps the streak going 💪",
        data: { type: 'alert', screen: 'Today' },
      });
      console.log(`[reminders] streak-saver pushed to ${rows.length} device(s) (tz ${tz})`);
    }
  }
}

// Hydration reminders at a few set hours (local) for users who opted in.
const WATER_LOCAL_MINS = [10 * 60, 13 * 60, 16 * 60, 19 * 60]; // 10am, 1pm, 4pm, 7pm
async function waterReminders(utcMin) {
  const tzRows = await q('SELECT DISTINCT tz_offset FROM device_tokens');
  for (const { tz_offset: tz } of tzRows) {
    const localMin = (((utcMin + tz) % 1440) + 1440) % 1440;
    if (!WATER_LOCAL_MINS.includes(localMin)) continue;
    // Opted-in users in this tz who haven't yet hit today's water goal.
    const rows = await q(
      `SELECT DISTINCT dt.token FROM device_tokens dt JOIN users u ON u.id = dt.user_id
       WHERE dt.tz_offset = $1 AND u.water_reminders = 1
         AND COALESCE(
           (SELECT w.glasses FROM water_intake w
             WHERE w.user_id = u.id AND w.day = (now() + make_interval(mins => $1))::date),
           0) < u.water_goal`,
      [tz]
    );
    if (rows.length) {
      await sendToTokens(rows.map((r) => r.token), {
        title: '💧 Hydration check',
        body: 'Time to drink a glass of water — tap to log it!',
        data: { type: 'water', screen: 'Today' },
      });
      console.log(`[reminders] water reminder pushed to ${rows.length} device(s) (tz ${tz})`);
    }
  }
}

async function tick() {
  if (!pushEnabled()) return; // skip the DB scan entirely when push is off
  try {
    const now = new Date();
    const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
    streakSaver(utcMin).catch((e) => console.log('[reminders] streak-saver error —', e.message));
    waterReminders(utcMin).catch((e) => console.log('[reminders] water reminder error —', e.message));

    // Due = local minute-of-day equals the reminder's hour*60+minute, enabled,
    // and not already pushed in the last 90s.
    const due = await q(
      `SELECT id, user_id, title, body
         FROM reminders
        WHERE enabled = 1
          AND ((( $1 + tz_offset) % 1440) + 1440) % 1440 = (hour * 60 + minute)
          AND (last_pushed_at IS NULL OR last_pushed_at < now() - interval '90 seconds')`,
      [utcMin]
    );

    for (const r of due) {
      await exec('UPDATE reminders SET last_pushed_at = now() WHERE id = $1', [r.id]);
      sendToUser(r.user_id, {
        title: r.title,
        body: r.body || 'Time to stay on track 💪',
        data: { type: 'reminder', reminderId: r.id, screen: 'Reminders' },
      }).catch((e) => console.log('[reminders] push failed —', e.message));
    }
    if (due.length) console.log(`[reminders] pushed ${due.length} due reminder(s)`);
  } catch (e) {
    console.log('[reminders] tick error —', e.message);
  }
}

// Start the once-a-minute loop. Aligns the first tick to the top of the next
// minute so reminders fire close to :00 seconds.
export function startReminderScheduler() {
  if (timer) return;
  const now = new Date();
  const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
  setTimeout(() => {
    tick();
    timer = setInterval(tick, 60 * 1000);
  }, Math.max(0, msToNextMinute));
  console.log('[reminders] scheduler started');
}
