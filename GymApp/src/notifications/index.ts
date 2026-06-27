import notifee, {
  AndroidImportance,
  TriggerType,
  TimestampTrigger,
  RepeatFrequency,
  AuthorizationStatus,
} from '@notifee/react-native';

const CHANNEL_ID = 'gym-reminders';

export async function ensureNotifPermission(): Promise<boolean> {
  const settings = await notifee.requestPermission();
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Diet & Workout Reminders',
    importance: AndroidImportance.HIGH,
    sound: 'default',
  });
  return settings.authorizationStatus >= AuthorizationStatus.AUTHORIZED;
}

// Next occurrence of hour:minute (today if still ahead, else tomorrow).
function nextOccurrence(hour: number, minute: number): number {
  const now = new Date();
  const t = new Date();
  t.setHours(hour, minute, 0, 0);
  if (t.getTime() <= now.getTime()) t.setDate(t.getDate() + 1);
  return t.getTime();
}

export type Reminder = {
  id: number;
  title: string;
  body?: string | null;
  hour: number;
  minute: number;
  enabled: number | boolean;
};

// Schedule a repeating daily notification. notifeeId is derived from reminder id
// so re-scheduling replaces the previous trigger instead of duplicating it.
export async function scheduleReminder(r: Reminder): Promise<void> {
  const notifeeId = `reminder-${r.id}`;
  await notifee.cancelNotification(notifeeId);
  if (!r.enabled) return;

  const trigger: TimestampTrigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: nextOccurrence(r.hour, r.minute),
    repeatFrequency: RepeatFrequency.DAILY,
  };

  await notifee.createTriggerNotification(
    {
      id: notifeeId,
      title: r.title,
      body: r.body || 'Time to stay on track 💪',
      android: { channelId: CHANNEL_ID, importance: AndroidImportance.HIGH, pressAction: { id: 'default' } },
      ios: { sound: 'default' },
    },
    trigger,
  );
}

export async function cancelReminder(id: number): Promise<void> {
  await notifee.cancelNotification(`reminder-${id}`);
}

const CHECKOUT_ID = 'checkout-reminder';

// Schedule a one-off "remember to check out" reminder `minutes` from now.
// Tapping it carries data.type='checkout' so the app can open the checkout flow.
export async function scheduleCheckoutReminder(minutes: number, gymName?: string): Promise<void> {
  const ok = await ensureNotifPermission();
  if (!ok) return;
  await notifee.cancelNotification(CHECKOUT_ID);
  const trigger: TimestampTrigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: Date.now() + minutes * 60 * 1000,
  };
  await notifee.createTriggerNotification(
    {
      id: CHECKOUT_ID,
      title: 'Heading out? 🏋️',
      body: `Don't forget to check out of ${gymName || 'the gym'} when you leave.`,
      data: { type: 'checkout' },
      android: { channelId: CHANNEL_ID, importance: AndroidImportance.HIGH, pressAction: { id: 'checkout' } },
      ios: { sound: 'default' },
    },
    trigger,
  );
}

export async function cancelCheckoutReminder(): Promise<void> {
  await notifee.cancelNotification(CHECKOUT_ID);
}

// Fire a notification immediately (used by the "Test" button so the user can
// confirm reminders actually pop up on their device).
export async function sendNow(title: string, body: string): Promise<boolean> {
  const ok = await ensureNotifPermission();
  if (!ok) return false;
  await notifee.displayNotification({
    title,
    body,
    android: { channelId: CHANNEL_ID, importance: AndroidImportance.HIGH, pressAction: { id: 'default' } },
    ios: { sound: 'default' },
  });
  return true;
}

// Re-sync all reminders from the server (call after login / on changes).
export async function syncReminders(reminders: Reminder[]): Promise<void> {
  await ensureNotifPermission();
  for (const r of reminders) await scheduleReminder(r);
}
