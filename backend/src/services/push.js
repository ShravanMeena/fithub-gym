// Push notifications via Firebase Cloud Messaging (FCM).
//
// FCM delivers to Android directly and to iOS through APNs. This module is a
// safe no-op until configured: if `firebase-admin` isn't installed or no
// service-account credentials are present, pushEnabled() is false and all
// send helpers return quietly — the rest of the server keeps working.
//
// Credentials (any one):
//   FIREBASE_SERVICE_ACCOUNT       -> the service-account JSON as a string
//   FIREBASE_SERVICE_ACCOUNT_FILE  -> path to the service-account JSON file
//   ./firebase-admin.json          -> default file next to the backend root
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { q, exec } from '../db/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let messaging = null; // FCM messaging instance once initialised
let initTried = false;

function loadCredential() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw && raw.trim().startsWith('{')) {
    try { return JSON.parse(raw); } catch { return null; }
  }
  const file =
    process.env.FIREBASE_SERVICE_ACCOUNT_FILE ||
    join(__dirname, '..', '..', 'firebase-admin.json');
  if (existsSync(file)) {
    try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
  }
  return null;
}

// Lazily init firebase-admin. Returns the messaging instance or null.
async function getMessaging() {
  if (messaging || initTried) return messaging;
  initTried = true;
  const creds = loadCredential();
  if (!creds) {
    console.log('[push] no Firebase credentials — push disabled');
    return null;
  }
  try {
    const admin = (await import('firebase-admin')).default;
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(creds) });
    }
    messaging = admin.messaging();
    console.log('[push] Firebase Cloud Messaging ready');
  } catch (e) {
    console.log('[push] firebase-admin unavailable —', e.message);
    messaging = null;
  }
  return messaging;
}

export function pushEnabled() {
  return !!messaging;
}

// Send a notification to an explicit list of device tokens. Prunes any tokens
// FCM reports as permanently invalid. Safe to call when push is disabled.
export async function sendToTokens(tokens, { title, body, data = {} } = {}) {
  const list = [...new Set((tokens || []).filter(Boolean))];
  if (!list.length) return { sent: 0 };
  const fcm = await getMessaging();
  if (!fcm) return { sent: 0 };

  // Coerce all data values to strings (FCM requirement).
  const dataStr = {};
  for (const [k, v] of Object.entries(data)) dataStr[k] = String(v);

  const message = {
    notification: { title, body },
    data: dataStr,
    android: { priority: 'high', notification: { channelId: 'gym-reminders', sound: 'default' } },
    apns: { payload: { aps: { sound: 'default' } } },
  };

  let sent = 0;
  const invalid = [];
  // sendEachForMulticast handles up to 500 tokens per call.
  for (let i = 0; i < list.length; i += 500) {
    const batch = list.slice(i, i + 500);
    try {
      const res = await fcm.sendEachForMulticast({ ...message, tokens: batch });
      sent += res.successCount;
      res.responses.forEach((r, idx) => {
        const code = r.error?.code || '';
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/invalid-argument'
        ) {
          invalid.push(batch[idx]);
        }
      });
    } catch (e) {
      console.log('[push] send error —', e.message);
    }
  }

  if (invalid.length) {
    try {
      await exec(`DELETE FROM device_tokens WHERE token = ANY($1)`, [invalid]);
    } catch { /* ignore cleanup failures */ }
  }
  return { sent, pruned: invalid.length };
}

// Send to everyone in an organization (optionally excluding one user, e.g. the
// admin who posted). No-op when push is disabled.
export async function sendToOrg(orgId, payload, { excludeUserId = null } = {}) {
  if (!orgId || !(await getMessaging())) return { sent: 0 };
  const rows =
    excludeUserId == null
      ? await q(`SELECT token FROM device_tokens WHERE org_id = $1`, [orgId])
      : await q(
          `SELECT token FROM device_tokens WHERE org_id = $1 AND (user_id IS NULL OR user_id <> $2)`,
          [orgId, excludeUserId]
        );
  return sendToTokens(rows.map((r) => r.token), payload);
}

// Send to a single user's devices.
export async function sendToUser(userId, payload) {
  if (!userId || !(await getMessaging())) return { sent: 0 };
  const rows = await q(`SELECT token FROM device_tokens WHERE user_id = $1`, [userId]);
  return sendToTokens(rows.map((r) => r.token), payload);
}

// Warm up at startup so logs show whether push is configured.
export async function initPush() {
  await getMessaging();
}
