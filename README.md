# IronFuel — AI Gym & Diet Tracker 💪

A full end-to-end fitness app: personalized AI diet plans, snap-a-photo calorie
tracking, progress logging, an AI coach, and meal/workout reminder alarms.

- **App:** React Native CLI (TypeScript) — `GymApp/`
- **Backend:** Node + Express + SQLite + JWT auth — `backend/`
- **AI:** AWS Bedrock (Anthropic Claude) for food vision, diet generation, coaching
  — with a built-in **mock mode** so the whole app runs offline before AWS is set up.

---

## Features

| Feature | How it works |
|---|---|
| **Accounts** | Email/password signup & login, JWT, session restore on launch |
| **Profile & goals** | Age/height/weight/goal/activity → BMR/TDEE (Mifflin–St Jeor) → daily calorie + macro targets |
| **AI Diet Plan** | Bedrock builds a meal-by-meal plan matched to your exact targets |
| **Food photo → calories** | Snap a meal → Bedrock vision estimates calories + protein/carbs/fat, then log it |
| **Daily dashboard** | Today's calories vs target + macro progress bars |
| **Progress tracking** | Log weight/body-fat, see trend + total change |
| **AI Coach** | Advice from your profile + recent progress + meals |
| **Reminders/alarms** | Daily local notifications (notifee) for meals & workouts |

---

## 1. Run the backend

```bash
cd backend
npm install
cp .env.example .env        # already created; MOCK_AI=1 by default
npm start                   # http://localhost:4000  (AI mode: mock)
```

Health check: `curl localhost:4000/health` → `{"ok":true,"ai":"mock"}`

### Enable real AWS Bedrock AI
1. In the AWS console, request access to the Claude models in **Bedrock → Model access**.
2. Put credentials + region in `backend/.env`:
   ```
   AWS_REGION=us-east-1
   AWS_ACCESS_KEY_ID=...
   AWS_SECRET_ACCESS_KEY=...
   BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-6-20250514-v1:0
   MOCK_AI=0
   ```
3. Restart the server. `/health` will report `"ai":"bedrock"`.

> The IAM user/role needs `bedrock:InvokeModel` on the chosen model.

---

## 2. Run the app

```bash
cd GymApp
npm install

# iOS
bundle install && (cd ios && pod install)
npm run ios

# Android (emulator running)
npm run android
```

**Backend URL:** `GymApp/src/api/config.ts` auto-selects `localhost` (iOS sim) or
`10.0.2.2` (Android emulator). For a **physical device**, set it to your computer's
LAN IP, e.g. `http://192.168.1.5:4000`.

---

## Architecture

```
gym/
├─ backend/
│  └─ src/
│     ├─ index.js              Express app + route mounting
│     ├─ db/index.js           SQLite schema (users, profiles, diet_plans,
│     │                        food_logs, progress_logs, reminders)
│     ├─ middleware/auth.js    JWT sign + authRequired guard
│     ├─ services/
│     │  ├─ nutrition.js       BMR/TDEE/macro math (ground truth)
│     │  └─ bedrock.js         3 AI functions + mock fallback
│     └─ routes/               auth, profile, diet, food, progress, reminders
└─ GymApp/
   └─ src/
      ├─ api/                  axios client + typed endpoint helpers
      ├─ context/AuthContext   session state
      ├─ navigation/           auth gate + bottom tabs
      ├─ notifications/        notifee scheduling
      ├─ components/           UI primitives + macro bars
      └─ screens/              Login, Signup, Home, Profile, Diet,
                               FoodScan, Progress, Coach, Reminders
```

## API summary
All `/api/*` routes except auth require `Authorization: Bearer <token>`.

```
POST /api/auth/signup|login        GET /api/auth/me
GET  /api/profile   PUT /api/profile
POST /api/diet/generate            GET /api/diet/current
POST /api/food/estimate            POST /api/food/log   GET /api/food/today
POST /api/progress  GET /api/progress  POST /api/progress/coach
GET/POST/PUT/DELETE /api/reminders
```

## Notes / next steps
- Mock AI returns deterministic sample data — great for demos; flip `MOCK_AI=0` for real Bedrock.
- For production: move JWT secret to a real secret store, use Postgres instead of SQLite,
  put the backend behind HTTPS, and store food photos in S3 instead of base64-in-request.
