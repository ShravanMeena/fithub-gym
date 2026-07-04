// Public early-access / waitlist capture from the marketing site (fithub-site).
// No auth. Superadmin views the list via GET /api/super/early-access.
import { Router } from 'express';
import { one } from '../db/index.js';

const router = Router();
const isEmail = (s) => typeof s === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

router.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    const email = (b.email || '').toString().trim().slice(0, 200);
    if (!isEmail(email)) return res.status(400).json({ error: 'Please enter a valid email.' });
    const val = (k, n) => (b[k] || '').toString().trim().slice(0, n);
    await one(
      `INSERT INTO early_access (name, email, phone, goal, gym, source) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (lower(email)) DO UPDATE SET
         name  = COALESCE(NULLIF(EXCLUDED.name, ''),  early_access.name),
         phone = COALESCE(NULLIF(EXCLUDED.phone, ''), early_access.phone),
         goal  = COALESCE(NULLIF(EXCLUDED.goal, ''),  early_access.goal),
         gym   = COALESCE(NULLIF(EXCLUDED.gym, ''),   early_access.gym)
       RETURNING id`,
      [val('name', 120), email, val('phone', 40), val('goal', 60), val('gym', 120), val('source', 40) || 'site']
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
