import { Router } from 'express';
import { z } from 'zod';
import { one, exec } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { computeTargets } from '../services/nutrition.js';
import { saveFile, streamFile, fileExists } from '../services/storage.js';

const router = Router();

// Serve a user's avatar (any logged-in member can view avatars).
router.get('/avatar/:userId', authRequired, async (req, res, next) => {
  try {
    const u = await one('SELECT avatar_path FROM users WHERE id = $1', [req.params.userId]);
    if (!u?.avatar_path || !(await fileExists(u.avatar_path))) return res.status(404).end();
    res.set('Content-Type', u.avatar_path.endsWith('.png') ? 'image/png' : 'image/jpeg');
    res.set('Cache-Control', 'private, max-age=60');
    streamFile(u.avatar_path).on('error', () => res.end()).pipe(res);
  } catch (e) { next(e); }
});

router.use(authRequired);

// Upload / replace the current user's avatar.
const avatarSchema = z.object({ imageBase64: z.string().min(10), mediaType: z.string().optional() });
router.post('/avatar', async (req, res, next) => {
  try {
    const parsed = avatarSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid image' });
    const mt = parsed.data.mediaType || 'image/jpeg';
    const key = `avatars/${req.user.id}.${mt === 'image/png' ? 'png' : 'jpg'}`;
    await saveFile(key, Buffer.from(parsed.data.imageBase64, 'base64'), mt);
    await exec('UPDATE users SET avatar_path = $1 WHERE id = $2', [key, req.user.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

const profileSchema = z.object({
  gender: z.enum(['male', 'female', 'other']).optional(),
  age: z.number().int().min(10).max(100).optional(),
  height_cm: z.number().min(80).max(250).optional(),
  weight_kg: z.number().min(25).max(300).optional(),
  goal: z.enum(['lose_fat', 'build_muscle', 'gain_weight', 'maintain', 'recomp']).optional(),
  activity_level: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']).optional(),
  diet_pref: z.enum(['veg', 'nonveg', 'vegan', 'eggetarian']).optional(),
  allergies: z.string().max(300).optional(),
  target_weight_kg: z.number().min(25).max(300).optional(),
  wake_time: z.string().max(5).optional(),
  sleep_time: z.string().max(5).optional(),
  gym_time: z.string().max(20).optional(),
  meals_per_day: z.number().int().min(3).max(6).optional(),
  phone: z.string().max(20).optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const profile = (await one('SELECT * FROM profiles WHERE user_id = $1', [req.user.id])) || {};
    const u = await one('SELECT avatar_path, phone FROM users WHERE id = $1', [req.user.id]);
    res.json({ profile: { ...profile, phone: u?.phone || null }, targets: computeTargets(profile), avatar: !!u?.avatar_path });
  } catch (e) { next(e); }
});

router.put('/', async (req, res, next) => {
  try {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const { phone, ...fields } = parsed.data; // phone lives on users, not profiles
    if (phone !== undefined) await exec('UPDATE users SET phone = $1 WHERE id = $2', [phone || null, req.user.id]);
    const keys = Object.keys(fields);
    await exec('INSERT INTO profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [req.user.id]);
    if (keys.length) {
      const set = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
      const vals = keys.map((k) => fields[k]);
      await exec(`UPDATE profiles SET ${set}, updated_at = now() WHERE user_id = $${keys.length + 1}`, [...vals, req.user.id]);
    }
    const profile = await one('SELECT * FROM profiles WHERE user_id = $1', [req.user.id]);
    const u = await one('SELECT phone FROM users WHERE id = $1', [req.user.id]);
    res.json({ profile: { ...profile, phone: u?.phone || null }, targets: computeTargets(profile) });
  } catch (e) { next(e); }
});

export default router;
