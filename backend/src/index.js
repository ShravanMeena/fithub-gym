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
import { initDb } from './db/index.js';
import { aiMode } from './services/bedrock.js';
import { storageMode } from './services/storage.js';

const app = express();
// Large limit so base64 photos / short videos fit.
app.use(express.json({ limit: '60mb' }));
app.use(cors());

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

// Unknown /api routes -> JSON 404.
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Serve the web panels (landing / admin / platform) from the same origin.
// STATIC_DIR defaults to ../../landing (works locally and in the Docker image).
const __dirname = dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = process.env.STATIC_DIR || join(__dirname, '..', '..', 'landing');
if (existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR));
  app.get('/', (req, res) => res.sendFile(join(STATIC_DIR, 'index.html')));
}

// Central error handler (routes call next(err) on DB failures).
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Server error' });
});

const PORT = process.env.PORT || 4000;
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`FitHub backend on :${PORT}  (AI: ${aiMode()}, storage: ${storageMode()}, static: ${existsSync(STATIC_DIR) ? 'on' : 'off'})`);
    });
  })
  .catch((e) => {
    console.error('DB init failed:', e);
    process.exit(1);
  });
