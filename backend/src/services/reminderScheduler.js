// Server-side reminder delivery. Every minute we find reminders whose local
// time (hour:minute in the user's timezone) matches "now" and push them via FCM
// to that user's devices. Replaces the app's old on-device scheduling.
//
// A reminder stores `tz_offset` (minutes ahead of UTC). local-minute-of-day =
// (utcMinuteOfDay + tz_offset) wrapped into [0,1440). `last_pushed_at` debounces
// so a reminder fires at most once per minute even if the tick drifts.
import { q, exec } from '../db/index.js';
import { pushEnabled, sendToUser } from './push.js';

let timer = null;

async function tick() {
  if (!pushEnabled()) return; // skip the DB scan entirely when push is off
  try {
    const now = new Date();
    const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();

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
