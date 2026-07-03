import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

import authRoutes from './routes/auth.js';
import orgRoutes from './routes/orgs.js';
import profileRoutes from './routes/profile.js';
import dietRoutes from './routes/diet.js';
import foodRoutes from './routes/food.js';
import progressRoutes from './routes/progress.js';
import photoRoutes from './routes/photos.js';
import reminderRoutes from './routes/reminders.js';
import attendanceRoutes from './routes/attendance.js';
import feedRoutes from './routes/feed.js';
import workoutRoutes from './routes/workouts.js';
import adminRoutes from './routes/admin.js';
import superRoutes from './routes/super.js';
import noticeRoutes from './routes/notices.js';
import deviceRoutes from './routes/devices.js';
import challengeRoutes from './routes/challenges.js';
import waterRoutes from './routes/water.js';
import appRoutes from './routes/app.js';
import referralRoutes from './routes/referral.js';
import aiRoutes from './routes/ai.js';
import meRoutes from './routes/me.js';
import prsRoutes from './routes/prs.js';
import analyticsRoutes from './routes/analytics.js';
import { initDb } from './db/index.js';
import { aiMode } from './services/bedrock.js';
import { storageMode } from './services/storage.js';
import { initPush } from './services/push.js';
import { startReminderScheduler } from './services/reminderScheduler.js';
import { apiLogger, startApiLogRetention } from './middleware/apiLogger.js';

const app = express();
app.set('trust proxy', true); // real client IP behind the reverse proxy
// Large limit so base64 photos / short videos fit.
app.use(express.json({ limit: '60mb' }));
app.use(cors());

// Observability: capture every /api request+response (fire-and-forget).
app.use(apiLogger);

app.get('/health', (req, res) => res.json({ ok: true, ai: aiMode() }));

app.use('/api/auth', authRoutes);
app.use('/api/orgs', orgRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/diet', dietRoutes);
app.use('/api/food', foodRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/photos', photoRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/workouts', workoutRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/super', superRoutes);
app.use('/api/notices', noticeRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/challenges', challengeRoutes);
app.use('/api/water', waterRoutes);
app.use('/api/app', appRoutes); // public — app update check
app.use('/api/referral', referralRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/me', meRoutes);
app.use('/api/prs', prsRoutes);
app.use('/api/analytics', analyticsRoutes);

// Unknown /api routes -> JSON 404.
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Serve the web panels (landing / admin / platform) from the same origin.
// STATIC_DIR defaults to ../../landing (works locally and in the Docker image).
const __dirname = dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = process.env.STATIC_DIR || join(__dirname, '..', '..', 'landing');
if (existsSync(STATIC_DIR)) {
  // extensions:['html'] lets /privacy resolve to privacy.html (clean URLs).
  app.use(express.static(STATIC_DIR, { extensions: ['html'] }));
  app.get('/', (req, res) => res.sendFile(join(STATIC_DIR, 'index.html')));
}

// Central error handler (routes call next(err) on DB failures).
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  req._error = err; // picked up by apiLogger so the real stack is stored
  res.status(500).json({ error: 'Server error' });
});

const PORT = process.env.PORT || 4000;
initDb()
  .then(async () => {
    await initPush();
    startReminderScheduler();
    startApiLogRetention();
    app.listen(PORT, () => {
      console.log(`FitHub backend on :${PORT}  (AI: ${aiMode()}, storage: ${storageMode()}, static: ${existsSync(STATIC_DIR) ? 'on' : 'off'})`);
    });
  })
  .catch((e) => {
    console.error('DB init failed:', e);
    process.exit(1);
  });
