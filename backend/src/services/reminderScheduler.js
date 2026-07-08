// Server-side reminder delivery. Every minute we find reminders whose local
// time (hour:minute in the user's timezone) matches "now" and push them via FCM
// to that user's devices. Replaces the app's old on-device scheduling.
//
// A reminder stores `tz_offset` (minutes ahead of UTC). local-minute-of-day =
// (utcMinuteOfDay + tz_offset) wrapped into [0,1440). `last_pushed_at` debounces
// so a reminder fires at most once per minute even if the tick drifts.
import { q, exec } from '../db/index.js';
import { pushEnabled, sendToUser, sendToTokens } from './push.js';
import { generateDailyMessage } from './bedrock.js';
import { getSetting } from './settings.js';

let timer = null;

// Daily AI good-morning / evening / good-night broadcasts.
const DAILY_SLOTS = [
  { slot: 'morning', localMin: 6 * 60, fallback: { title: '☀️ Good morning!', body: 'New day, new gains. Plan your gym session and crush it today 💪' } },
  { slot: 'evening', localMin: 18 * 60, fallback: { title: '🔥 Evening check-in', body: 'Did you move today? Even a quick session counts — let’s go!' } },
  { slot: 'night', localMin: 21 * 60, fallback: { title: '🌙 Good night', body: 'Rest well — your muscles grow while you sleep. See you tomorrow 💪' } },
];
const dailyCache = new Map(); // `${date}:${slot}` -> { title, body }

async function getDailyMessage(slot, fallback) {
  const date = new Date().toISOString().slice(0, 10);
  const key = `${date}:${slot}`;
  if (dailyCache.has(key)) return dailyCache.get(key);
  const msg = (await generateDailyMessage(slot).catch(() => null)) || fallback;
  dailyCache.set(key, msg);
  if (dailyCache.size > 12) for (const k of dailyCache.keys()) if (!k.startsWith(date)) dailyCache.delete(k);
  return msg;
}

// At 6am / 6pm / 9pm local (per timezone), send the day's AI message to everyone.
async function dailyMessages(utcMin) {
  if ((await getSetting('daily_messages', 'on')) === 'off') return;
  const tzRows = await q('SELECT DISTINCT tz_offset FROM device_tokens');
  for (const { tz_offset: tz } of tzRows) {
    const localMin = (((utcMin + tz) % 1440) + 1440) % 1440;
    const slot = DAILY_SLOTS.find((s) => s.localMin === localMin);
    if (!slot) continue;
    const rows = await q('SELECT DISTINCT token FROM device_tokens WHERE tz_offset = $1', [tz]);
    if (!rows.length) continue;
    const msg = await getDailyMessage(slot.slot, slot.fallback);
    await sendToTokens(rows.map((r) => r.token), { title: msg.title, body: msg.body, data: { type: 'daily', screen: 'Today' } });
    console.log(`[reminders] daily ${slot.slot} message pushed to ${rows.length} device(s) (tz ${tz})`);
  }
}

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

// Nudge active members (trained in the last 7 days) who haven't logged any food
// today, so they keep their diet on track. Runs at 8:30pm local per timezone.
const DIET_NUDGE_LOCAL_MIN = 20 * 60 + 30; // 8:30 PM
async function dietNudge(utcMin) {
  const tzRows = await q('SELECT DISTINCT tz_offset FROM device_tokens');
  for (const { tz_offset: tz } of tzRows) {
    const localMin = (((utcMin + tz) % 1440) + 1440) % 1440;
    if (localMin !== DIET_NUDGE_LOCAL_MIN) continue;
    const rows = await q(
      `SELECT DISTINCT dt.token FROM device_tokens dt JOIN users u ON u.id = dt.user_id
       WHERE dt.tz_offset = $1
         AND EXISTS (SELECT 1 FROM attendance a WHERE a.user_id = u.id AND a.checked_in_at >= now() - interval '7 days')
         AND NOT EXISTS (
           SELECT 1 FROM food_logs f WHERE f.user_id = u.id
             AND (f.eaten_at + make_interval(mins => $1))::date = (now() + make_interval(mins => $1))::date)`,
      [tz]
    );
    if (rows.length) {
      await sendToTokens(rows.map((r) => r.token), {
        title: '🍗 Did you eat well today?',
        body: 'Log your meals so we can keep your calories & protein on track.',
        data: { type: 'diet', screen: 'Diet' },
      });
      console.log(`[reminders] diet nudge pushed to ${rows.length} device(s) (tz ${tz})`);
    }
  }
}

// Hydration nudges — active members who are under their daily water goal get a
// reminder at 2pm & 7pm local. Global on/off via the 'water_reminders' setting.
const WATER_NUDGE_MINS = [14 * 60, 19 * 60];
async function waterNudge(utcMin) {
  if ((await getSetting('water_reminders', 'on')) === 'off') return;
  const tzRows = await q('SELECT DISTINCT tz_offset FROM device_tokens');
  for (const { tz_offset: tz } of tzRows) {
    const localMin = (((utcMin + tz) % 1440) + 1440) % 1440;
    if (!WATER_NUDGE_MINS.includes(localMin)) continue;
    const rows = await q(
      `SELECT DISTINCT dt.token FROM device_tokens dt JOIN users u ON u.id = dt.user_id
       WHERE dt.tz_offset = $1
         AND EXISTS (SELECT 1 FROM attendance a WHERE a.user_id = u.id AND a.checked_in_at >= now() - interval '10 days')
         AND COALESCE((SELECT ml FROM water_intake w WHERE w.user_id = u.id
              AND w.day = (now() + make_interval(mins => $1))::date), 0) < COALESCE(u.water_goal_ml, 3000)`,
      [tz]
    );
    if (rows.length) {
      await sendToTokens(rows.map((r) => r.token), {
        title: '💧 Time to hydrate',
        body: 'Sip some water and log it — stay on track for your daily goal.',
        data: { type: 'water', screen: 'Diet' },
      });
      console.log(`[reminders] water nudge pushed to ${rows.length} device(s) (tz ${tz})`);
    }
  }
}

// Sunday 10am local: nudge active members to open their weekly recap.
const RECAP_LOCAL_MIN = 10 * 60;
async function weeklyRecap(utcMin) {
  const tzRows = await q('SELECT DISTINCT tz_offset FROM device_tokens');
  for (const { tz_offset: tz } of tzRows) {
    const localMin = (((utcMin + tz) % 1440) + 1440) % 1440;
    if (localMin !== RECAP_LOCAL_MIN) continue;
    // Only on the local Sunday (0 = Sunday).
    const localDow = new Date(Date.now() + tz * 60000).getUTCDay();
    if (localDow !== 0) continue;
    const rows = await q(
      `SELECT DISTINCT dt.token FROM device_tokens dt
       WHERE dt.tz_offset = $1
         AND EXISTS (SELECT 1 FROM attendance a WHERE a.user_id = dt.user_id AND a.checked_in_at >= now() - interval '10 days')`,
      [tz]
    );
    if (rows.length) {
      await sendToTokens(rows.map((r) => r.token), {
        title: '📊 Your week is in!',
        body: 'See your sessions, streak and progress this week 💪',
        data: { type: 'alert', screen: 'Today' },
      });
      console.log(`[reminders] weekly recap pushed to ${rows.length} device(s) (tz ${tz})`);
    }
  }
}

async function tick() {
  if (!pushEnabled()) return; // skip the DB scan entirely when push is off
  try {
    const now = new Date();
    const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
    streakSaver(utcMin).catch((e) => console.log('[reminders] streak-saver error —', e.message));
    weeklyRecap(utcMin).catch((e) => console.log('[reminders] weekly recap error —', e.message));
    dietNudge(utcMin).catch((e) => console.log('[reminders] diet nudge error —', e.message));
    waterNudge(utcMin).catch((e) => console.log('[reminders] water nudge error —', e.message));
    dailyMessages(utcMin).catch((e) => console.log('[reminders] daily message error —', e.message));

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
