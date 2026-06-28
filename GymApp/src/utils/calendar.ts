// Device-calendar integration: ask permission and add the user's gym sessions
// as recurring weekly calendar events with an alarm — so the OS reminds them
// before each workout, even if the app is closed.
import { NativeModules, Platform } from 'react-native';
import RNCalendarEvents from 'react-native-calendar-events';

// ---- Real Clock-app alarm (Android only) ----
const { GymAlarm } = NativeModules as { GymAlarm?: { setAlarm: (h: number, m: number, days: number[], msg: string, skipUi: boolean) => Promise<boolean> } };

// Whether we can set a real ringing alarm on this device.
export const canSetAlarm = Platform.OS === 'android' && !!GymAlarm;

// Set one repeating Clock alarm on the chosen days at hour:minute.
export async function setGymAlarm(days: number[], hour: number, minute: number, message = 'Gym time 🏋️'): Promise<boolean> {
  if (!GymAlarm) throw new Error('Alarms are only available on Android');
  return GymAlarm.setAlarm(hour, minute, days, message, true);
}

export async function ensureCalendarPermission(): Promise<boolean> {
  try {
    let status = await RNCalendarEvents.checkPermissions();
    if (status !== 'authorized') status = await RNCalendarEvents.requestPermissions();
    return status === 'authorized';
  } catch {
    return false;
  }
}

// Next occurrence of `weekday` (0=Sun … 6=Sat) at hour:minute.
function nextForWeekday(weekday: number, hour: number, minute: number): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  let diff = (weekday - d.getDay() + 7) % 7;
  if (diff === 0 && d.getTime() <= Date.now()) diff = 7; // today already passed -> next week
  d.setDate(d.getDate() + diff);
  return d;
}

// Pick a writable calendar (prefer the primary one) so events don't land in the
// lib's hard-coded default calendar (id 1), which may be wrong or read-only.
async function writableCalendarId(): Promise<string | undefined> {
  try {
    const cals: any[] = await RNCalendarEvents.findCalendars();
    const writable = cals.filter((c) => c.allowsModifications);
    const chosen = writable.find((c) => c.isPrimary) || writable[0];
    return chosen?.id;
  } catch {
    return undefined;
  }
}

// Create one weekly-recurring "Gym time" event per selected day, with an alarm
// `leadMinutes` before. Returns how many were added.
export async function addGymSchedule(days: number[], hour: number, minute: number, leadMinutes = 30): Promise<number> {
  const calendarId = await writableCalendarId();
  let count = 0;
  for (const wd of days) {
    const start = nextForWeekday(wd, hour, minute);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    await RNCalendarEvents.saveEvent('🏋️ Gym time', {
      ...(calendarId ? { calendarId } : {}),
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      notes: 'Time to train 💪 — FitHub',
      alarms: [{ date: -Math.abs(leadMinutes) }],
      recurrenceRule: { frequency: 'weekly', interval: 1 },
    } as any);
    count++;
  }
  return count;
}
