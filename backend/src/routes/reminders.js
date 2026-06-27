import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

const schema = z.object({
  title: z.string().min(1).max(80),
  body: z.string().max(200).optional(),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  enabled: z.boolean().default(true),
});

router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM reminders WHERE user_id = ? ORDER BY hour, minute')
    .all(req.user.id);
  res.json({ reminders: rows });
});

router.post('/', (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const d = parsed.data;
  const info = db
    .prepare(
      'INSERT INTO reminders (user_id, title, body, hour, minute, enabled) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(req.user.id, d.title, d.body ?? null, d.hour, d.minute, d.enabled ? 1 : 0);
  const row = db.prepare('SELECT * FROM reminders WHERE id = ?').get(info.lastInsertRowid);
  res.json({ reminder: row });
});

router.put('/:id', (req, res) => {
  const parsed = schema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const fields = parsed.data;
  if ('enabled' in fields) fields.enabled = fields.enabled ? 1 : 0;
  const keys = Object.keys(fields);
  if (keys.length) {
    const set = keys.map((k) => `${k} = @${k}`).join(', ');
    db.prepare(`UPDATE reminders SET ${set} WHERE id = @id AND user_id = @user_id`).run({
      ...fields,
      id: req.params.id,
      user_id: req.user.id,
    });
  }
  const row = db.prepare('SELECT * FROM reminders WHERE id = ? AND user_id = ?').get(
    req.params.id,
    req.user.id
  );
  res.json({ reminder: row });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM reminders WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

export default router;
