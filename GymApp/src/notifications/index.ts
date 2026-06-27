import notifee, {
  AndroidImportance,
  TriggerType,
  TimestampTrigger,
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

export type Reminder = {
  id: number;
  title: string;
  body?: string | null;
  hour: number;
  minute: number;
  enabled: number | boolean;
};

// Daily reminders are delivered by the SERVER via push now (the backend reminder
// scheduler fires each one at the user's local time). These remain as no-ops so
// existing call sites keep working — there's nothing to schedule on-device, and
// it avoids double notifications. We just clean up any leftover local triggers
// from older app versions.
export async function scheduleReminder(r: Reminder): Promise<void> {
  await notifee.cancelTriggerNotification(`reminder-${r.id}`).catch(() => {});
}

export async function cancelReminder(id: number): Promise<void> {
  await notifee.cancelTriggerNotification(`reminder-${id}`).catch(() => {});
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

const REST_ID = 'rest-timer';

// Fire a notification when the rest timer ends — works even if the screen locks.
export async function scheduleRestDone(seconds: number): Promise<void> {
  await notifee.cancelNotification(REST_ID);
  if (seconds <= 0) return;
  const trigger: TimestampTrigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: Date.now() + seconds * 1000,
  };
  await notifee.createTriggerNotification(
    {
      id: REST_ID,
      title: 'Rest over! 💪',
      body: 'Time for your next set.',
      android: { channelId: CHANNEL_ID, importance: AndroidImportance.HIGH, pressAction: { id: 'default' } },
      ios: { sound: 'default' },
    },
    trigger,
  );
}

export async function cancelRestDone(): Promise<void> {
  await notifee.cancelNotification(REST_ID);
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

// Reminders are server-pushed now; this just makes sure notification permission
// and the channel are ready so pushes can display.
export async function syncReminders(_reminders: Reminder[]): Promise<void> {
  await ensureNotifPermission();
}
