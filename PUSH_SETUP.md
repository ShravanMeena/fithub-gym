# Push Notifications Setup (FCM — Android + iOS)

Server push is fully wired in code. It fires when:
- a gym admin posts an **announcement** (`POST /api/admin/announce`)
- a gym admin posts a **home notice** (`POST /api/admin/notices`)
- a user's **daily reminder** time arrives (backend scheduler sends it via push at
  the user's local time — reminders are no longer scheduled on-device)

Until you complete the steps below, push is a **safe no-op** (the server logs
`[push] no Firebase credentials — push disabled` and runs normally).

> **Backend push needs the service-account key (step 4) — the client config files
> you already added (`google-services.json` / `GoogleService-Info.plist`) only let
> the *app* receive pushes; the *server* needs its own admin key to send them.**

Bundle id is now **`com.fithub.gym`** on both platforms.

---

## 1. Create a Firebase project (free)
1. https://console.firebase.google.com → **Add project** (e.g. "FitHub").
2. You do NOT need Google Analytics.

## 2. Register the apps (use bundle id `com.fithub.gym` for both)
- **Android app** → Android package name `com.fithub.gym` → download
  **`google-services.json`** → place at:
  `GymApp/android/app/google-services.json`
- **iOS app** → Apple bundle id `com.fithub.gym` → download
  **`GoogleService-Info.plist`** → drag into Xcode under the **GymApp** target
  (check "Copy items if needed" + the GymApp target) so it lands at:
  `GymApp/ios/GymApp/GoogleService-Info.plist`

## 3. iOS only — APNs key (needs a paid Apple Developer account)
1. https://developer.apple.com → Certificates, IDs & Profiles → **Keys** → **+**
   → enable **Apple Push Notifications service (APNs)** → download the **`.p8`**
   (note the **Key ID** and your **Team ID**).
2. Firebase Console → Project Settings → **Cloud Messaging** → **Apple app
   configuration** → upload the `.p8` + Key ID + Team ID.
3. In **Xcode** → GymApp target → **Signing & Capabilities** → **+ Capability**:
   add **Push Notifications** and **Background Modes → Remote notifications**.
   (Select your Team so Xcode provisions the APNs entitlement.)
> iOS push only works on a **real device**, never the simulator.

## 4. Backend — service account key (lets the server send pushes)
1. Firebase Console → Project Settings → **Service accounts** →
   **Generate new private key** → downloads a JSON file.
2. Put it on the server one of two ways:
   - **Recommended:** paste the whole JSON onto one line in
     `.env.production` as `FIREBASE_SERVICE_ACCOUNT={...}` (no file on disk), **or**
   - copy the file to the VM as `backend/firebase-admin.json`.

## 5. Build & deploy
**App (your Mac):**
```bash
cd GymApp
# iOS
cd ios && pod install && cd ..
npx react-native run-ios --device      # real device
# Android
npx react-native run-android
```
**Backend (VM):**
```bash
cd ~/fithub && git pull
# add FIREBASE_SERVICE_ACCOUNT=... to .env.production
docker compose up -d --build
docker compose logs api | grep '\[push\]'   # expect: Firebase Cloud Messaging ready
```

---

## How it works
- App asks notification permission on login, gets its **FCM token**, and registers
  it at `POST /api/devices/register` (scoped to the user + their gym).
- `device_tokens` table stores one row per device; invalid tokens are auto-pruned
  on send. Token is removed on logout (`/api/devices/unregister`).
- Admin announce/notice → `sendToOrg()` pushes to every member of that gym.
- **Reminders:** the app stores each reminder's time + the device's UTC offset;
  a backend loop ([services/reminderScheduler.js](backend/src/services/reminderScheduler.js))
  runs every minute and pushes any reminder whose local time is "now".
- **Foreground:** notifee displays it. **Background/quit:** the OS shows it.
  **Tap:** routes to **Feed** (announcement), **Home** (notice), **Reminders**.

## Files touched
- Backend: `services/push.js`, `routes/devices.js`, `routes/admin.js` (triggers),
  `db/index.js` (`device_tokens` table), `index.js` (mount + `initPush`).
- App: `src/notifications/push.ts`, `src/api/client.ts` (`DeviceAPI`),
  `src/context/AuthContext.tsx`, `App.tsx`, `index.js`.
- Native: iOS `AppDelegate.swift` (`FirebaseApp.configure()`), `Podfile`,
  `Info.plist`; Android `build.gradle` (×2). Bundle id → `com.fithub.gym`.
