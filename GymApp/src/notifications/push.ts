// Server push (FCM) — device-token registration + display + tap routing.
//
// Local reminders/alarms still live in ./index.ts (notifee). This file handles
// REMOTE pushes the backend sends (announcements, home notices, etc.).
//
// Flow:
//   • on login/app-open  -> registerForPush(): ask permission, get the FCM
//     token, send it to the server (/api/devices/register).
//   • foreground message -> notifee shows it (FCM stays silent while in app).
//   • tap (any state)    -> route to Feed/Home via the nav ref.
//   • on logout          -> unregisterPush(): drop the token server-side.
import { Platform } from 'react-native';
import notifee, { AndroidImportance, EventType } from '@notifee/react-native';
import { getApp } from '@react-native-firebase/app';
import {
  getMessaging,
  getToken,
  deleteToken,
  requestPermission,
  registerDeviceForRemoteMessages,
  onTokenRefresh,
  onMessage,
  onNotificationOpenedApp,
  getInitialNotification,
  setBackgroundMessageHandler,
  AuthorizationStatus,
} from '@react-native-firebase/messaging';
import { DeviceAPI } from '../api/client';
import { navTo } from '../navigation/ref';

const CHANNEL_ID = 'gym-reminders';
const messaging = () => getMessaging(getApp());

let lastToken: string | null = null;
let unsubRefresh: (() => void) | null = null;
let handlersReady = false;

// Route a tapped push to the right screen based on its data payload.
// (Tab routes are Today / Diet / Community / Progress.)
function routeFromData(data?: Record<string, any>) {
  if (!data) return;
  if (data.type === 'announcement') navTo('Community');
  else if (data.type === 'notice' || data.type === 'alert' || data.type === 'water') navTo('Today');
  else if (data.type === 'reminder') navTo('Reminders');
  else if (data.type === 'pr') navTo('Workout');
  else if (data.screen === 'Home') navTo('Today');
  else if (data.screen === 'Feed') navTo('Community');
  else if (data.screen) navTo(String(data.screen));
}

// Ask permission, fetch the FCM token, and register it with the backend.
// Safe to call repeatedly (e.g. every login). orgId scopes the token to a gym.
export async function registerForPush(orgId?: number): Promise<string | null> {
  try {
    const m = messaging();
    const status = await requestPermission(m);
    const granted =
      status === AuthorizationStatus.AUTHORIZED ||
      status === AuthorizationStatus.PROVISIONAL;
    if (!granted) return null;

    if (Platform.OS === 'ios') await registerDeviceForRemoteMessages(m);

    const token = await getToken(m);
    if (!token) return null;
    lastToken = token;
    await DeviceAPI.register(token, Platform.OS, orgId);

    // Re-register if FCM rotates the token.
    if (!unsubRefresh) {
      unsubRefresh = onTokenRefresh(m, async (next) => {
        lastToken = next;
        try { await DeviceAPI.register(next, Platform.OS, orgId); } catch {}
      });
    }
    return token;
  } catch (e) {
    console.log('[push] register failed', e);
    return null;
  }
}

// Drop this device's token (call on logout).
export async function unregisterPush() {
  try {
    const m = messaging();
    const token = lastToken || (await getToken(m).catch(() => null));
    if (token) await DeviceAPI.unregister(token).catch(() => {});
    await deleteToken(m).catch(() => {});
    lastToken = null;
  } catch (e) {
    console.log('[push] unregister failed', e);
  }
}

// Wire foreground display + tap routing. Call once at app start.
export function setupPushHandlers() {
  if (handlersReady) return;
  handlersReady = true;
  const m = messaging();

  // Foreground messages don't show automatically — display via notifee.
  onMessage(m, async (msg) => {
    const n = msg.notification;
    await notifee.displayNotification({
      title: n?.title || 'FitHub',
      body: n?.body || '',
      data: msg.data || {},
      android: { channelId: CHANNEL_ID, importance: AndroidImportance.HIGH, pressAction: { id: 'default' } },
    });
  });

  // Tap on a notifee-displayed (foreground) push.
  notifee.onForegroundEvent(({ type, detail }) => {
    if (type === EventType.PRESS) routeFromData(detail.notification?.data as any);
  });

  // Tap that brought the app from background -> foreground.
  onNotificationOpenedApp(m, (msg) => routeFromData(msg?.data));

  // Tap that cold-started the app from a quit state.
  getInitialNotification(m).then((msg) => {
    if (msg) setTimeout(() => routeFromData(msg.data), 600);
  });
}

// Background/quit messages with a `notification` block are shown by the OS;
// this handler just satisfies the SDK requirement (must be set at module load).
export function registerBackgroundPushHandler() {
  setBackgroundMessageHandler(messaging(), async () => {});
}
