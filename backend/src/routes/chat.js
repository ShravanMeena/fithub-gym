// Chat: 1-on-1 direct messages + a per-gym group chat. Admins can moderate the
// group (remove/block members, delete any message). HTTP + polling from the app.
import { Router } from 'express';
import { z } from 'zod';
import { q, one } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { sendToUser } from '../services/push.js';
import { saveFile, streamFile, fileExists } from '../services/storage.js';

const router = Router();
router.use(authRequired);

const meInfo = (userId) => one('SELECT id, name, org_id, role FROM users WHERE id = $1', [userId]);

// Attach reactions (grouped emoji + whether I reacted) to a page of messages.
async function withReactions(messages, userId) {
  if (!messages.length) return messages;
  const ids = messages.map((m) => m.id);
  const rows = await q(
    `SELECT message_id, emoji, COUNT(*)::int AS count, COUNT(*) FILTER (WHERE user_id=$1)::int AS mine
     FROM chat_reactions WHERE message_id = ANY($2) GROUP BY message_id, emoji`,
    [userId, ids]
  );
  const byMsg = new Map();
  for (const r of rows) {
    if (!byMsg.has(r.message_id)) byMsg.set(r.message_id, []);
    byMsg.get(r.message_id).push({ emoji: r.emoji, count: r.count, mine: r.mine > 0 });
  }
  return messages.map((m) => ({ ...m, reactions: byMsg.get(m.id) || [] }));
}
const membership = (convId, userId) => one('SELECT * FROM conversation_members WHERE conversation_id = $1 AND user_id = $2', [convId, userId]);
const ensureMember = (convId, userId) =>
  one('INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING conversation_id', [convId, userId]);

// Find (or lazily create) this gym's single group conversation.
async function getOrgGroup(orgId) {
  let g = await one("SELECT * FROM conversations WHERE org_id = $1 AND type = 'group' LIMIT 1", [orgId]);
  if (!g) {
    const org = await one('SELECT name FROM organizations WHERE id = $1', [orgId]);
    g = await one("INSERT INTO conversations (org_id, type, title) VALUES ($1,'group',$2) RETURNING *", [orgId, `${org?.name || 'Gym'} Chat`]);
  }
  return g;
}

// ---- Static routes first (so param routes don't shadow them) ----

// My conversations: the gym group (auto-joined) + my DMs, with last message + unread.
router.get('/conversations', async (req, res, next) => {
  try {
    const me = await meInfo(req.user.id);
    const group = await getOrgGroup(me.org_id);
    await ensureMember(group.id, me.id);
    const rows = await q(
      `SELECT c.id, c.type, c.title, cm.last_read_id,
        (SELECT body FROM chat_messages m WHERE m.conversation_id=c.id AND m.deleted=0 ORDER BY m.id DESC LIMIT 1) AS last_body,
        (SELECT created_at FROM chat_messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) AS last_at,
        (SELECT MAX(m.id) FROM chat_messages m WHERE m.conversation_id=c.id) AS last_id,
        (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id=c.id AND m.id>cm.last_read_id AND m.sender_id<>$1 AND m.deleted=0) AS unread
       FROM conversation_members cm JOIN conversations c ON c.id=cm.conversation_id
       WHERE cm.user_id=$1 AND cm.blocked=0
       ORDER BY last_id DESC NULLS LAST`,
      [me.id]
    );
    const conversations = await Promise.all(rows.map(async (c) => {
      const base = { id: c.id, type: c.type, unread: Number(c.unread) || 0, last_body: c.last_body || null, last_at: c.last_at || null };
      if (c.type === 'group') return { ...base, title: c.title };
      const other = await one(
        `SELECT u.id, u.name, (u.avatar_path IS NOT NULL) AS has_avatar
         FROM conversation_members cm JOIN users u ON u.id=cm.user_id
         WHERE cm.conversation_id=$1 AND cm.user_id<>$2 LIMIT 1`, [c.id, me.id]);
      return { ...base, title: other?.name || 'Member', otherId: other?.id || null, otherAvatar: !!other?.has_avatar };
    }));
    res.json({ conversations, groupId: group.id });
  } catch (e) { next(e); }
});

// The gym group conversation id (used by the web admin + a "Group" shortcut).
router.get('/group', async (req, res, next) => {
  try {
    const me = await meInfo(req.user.id);
    const group = await getOrgGroup(me.org_id);
    await ensureMember(group.id, me.id);
    res.json({ conversationId: group.id, title: group.title });
  } catch (e) { next(e); }
});

// Gym members you can start a DM with.
router.get('/members', async (req, res, next) => {
  try {
    const me = await meInfo(req.user.id);
    const rows = await q(
      `SELECT id, name, (avatar_path IS NOT NULL) AS has_avatar FROM users
       WHERE org_id=$1 AND id<>$2 AND role IN ('member','admin') ORDER BY name`,
      [me.org_id, me.id]
    );
    res.json({ members: rows.map((r) => ({ id: r.id, name: r.name, avatar: !!r.has_avatar })) });
  } catch (e) { next(e); }
});

// Get or create a 1-on-1 conversation with another gym member.
router.post('/direct/:userId', async (req, res, next) => {
  try {
    const me = await meInfo(req.user.id);
    const otherId = Number(req.params.userId);
    if (!otherId || otherId === me.id) return res.status(400).json({ error: 'Invalid user' });
    const other = await one('SELECT id, org_id FROM users WHERE id=$1', [otherId]);
    if (!other || other.org_id !== me.org_id) return res.status(404).json({ error: 'Member not found' });
    const dkey = `${me.org_id}:${Math.min(me.id, otherId)}:${Math.max(me.id, otherId)}`;
    let conv = await one('SELECT * FROM conversations WHERE dkey=$1', [dkey]);
    if (!conv) {
      conv = await one("INSERT INTO conversations (org_id, type, dkey) VALUES ($1,'direct',$2) RETURNING *", [me.org_id, dkey]);
      await ensureMember(conv.id, me.id);
      await ensureMember(conv.id, otherId);
    } else {
      await ensureMember(conv.id, me.id);
    }
    res.json({ conversationId: conv.id });
  } catch (e) { next(e); }
});

// Delete a message — the sender, or an admin of the gym (moderation). Soft delete.
router.delete('/messages/:mid', async (req, res, next) => {
  try {
    const msg = await one('SELECT m.*, c.org_id FROM chat_messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.id=$1', [Number(req.params.mid)]);
    if (!msg) return res.status(404).json({ error: 'Not found' });
    const me = await meInfo(req.user.id);
    const allowed = msg.sender_id === me.id || (me.role === 'admin' && me.org_id === msg.org_id);
    if (!allowed) return res.status(403).json({ error: 'Not allowed' });
    await one("UPDATE chat_messages SET deleted=1, body='' WHERE id=$1 RETURNING id", [msg.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---- Conversation-scoped (param) routes ----

// Messages. `?after=<id>` for polling new ones, `?before=<id>` for older pages.
router.get('/:id/messages', async (req, res, next) => {
  try {
    const convId = Number(req.params.id);
    const mem = await membership(convId, req.user.id);
    if (!mem || mem.blocked) return res.status(403).json({ error: 'You are not in this chat.' });
    const before = req.query.before ? Number(req.query.before) : null;
    const after = req.query.after ? Number(req.query.after) : null;
    let rows;
    const SEL = `m.id, m.sender_id, m.body, m.deleted, m.image_path, m.reply_to_id, m.created_at,
                 u.name AS sender, (u.avatar_path IS NOT NULL) AS has_avatar,
                 r.body AS reply_body, r.image_path AS reply_image, r.sender_id AS reply_sender_id, ru.name AS reply_sender
                 FROM chat_messages m
                 LEFT JOIN users u ON u.id=m.sender_id
                 LEFT JOIN chat_messages r ON r.id=m.reply_to_id
                 LEFT JOIN users ru ON ru.id=r.sender_id`;
    if (after) {
      rows = await q(`SELECT ${SEL} WHERE m.conversation_id=$1 AND m.id>$2 ORDER BY m.id ASC LIMIT 100`, [convId, after]);
    } else {
      rows = await q(`SELECT ${SEL} WHERE m.conversation_id=$1 AND ($2::int IS NULL OR m.id<$2) ORDER BY m.id DESC LIMIT 40`, [convId, before]);
      rows.reverse();
    }
    // Mark read up to the newest message we returned.
    const maxId = rows.length ? rows[rows.length - 1].id : mem.last_read_id;
    if (maxId > mem.last_read_id) {
      await one('UPDATE conversation_members SET last_read_id=$1 WHERE conversation_id=$2 AND user_id=$3 RETURNING conversation_id', [maxId, convId, req.user.id]);
    }
    const messages = await withReactions(rows.map((m) => shapeMessage(m, req.user.id)), req.user.id);
    res.json({ messages });
  } catch (e) { next(e); }
});

function shapeMessage(m, userId) {
  return {
    id: m.id, senderId: m.sender_id, sender: m.sender, senderAvatar: !!m.has_avatar,
    body: m.deleted ? null : m.body, deleted: !!m.deleted,
    imageUrl: m.deleted ? null : (m.image_path ? `/api/chat/image/${m.id}` : null),
    reply: m.reply_to_id ? {
      id: m.reply_to_id, sender: m.reply_sender || 'Member', mine: m.reply_sender_id === userId,
      text: m.reply_body || (m.reply_image ? '📷 Photo' : ''),
    } : null,
    reactions: [], created_at: m.created_at, mine: m.sender_id === userId,
  };
}

const sendSchema = z.object({
  body: z.string().trim().max(2000).optional().default(''),
  imageBase64: z.string().min(10).optional(),
  mediaType: z.string().optional(),
  replyToId: z.number().int().optional(),
});
router.post('/:id/messages', async (req, res, next) => {
  try {
    const convId = Number(req.params.id);
    const mem = await membership(convId, req.user.id);
    if (!mem) return res.status(403).json({ error: 'You are not in this chat.' });
    if (mem.blocked) return res.status(403).json({ error: 'You have been removed from this chat.' });
    const parsed = sendSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const d = parsed.data;
    if (!d.body && !d.imageBase64) return res.status(400).json({ error: 'Write a message or add a photo.' });
    const me = await meInfo(req.user.id);

    const ins = await one('INSERT INTO chat_messages (conversation_id, sender_id, body, reply_to_id) VALUES ($1,$2,$3,$4) RETURNING id', [convId, me.id, d.body || '', d.replyToId || null]);
    if (d.imageBase64) {
      try {
        const mt = d.mediaType || 'image/jpeg';
        const key = `chat/${convId}/${ins.id}.${mt === 'image/png' ? 'png' : 'jpg'}`;
        await saveFile(key, Buffer.from(d.imageBase64, 'base64'), mt);
        await one('UPDATE chat_messages SET image_path=$1 WHERE id=$2 RETURNING id', [key, ins.id]);
      } catch (err) { console.error('chat image save failed:', err.message); }
    }
    await one('UPDATE conversation_members SET last_read_id=$1 WHERE conversation_id=$2 AND user_id=$3 RETURNING conversation_id', [ins.id, convId, me.id]);

    // Reload the message with its reply preview.
    const row = await one(
      `SELECT m.id, m.sender_id, m.body, m.deleted, m.image_path, m.reply_to_id, m.created_at,
        u.name AS sender, (u.avatar_path IS NOT NULL) AS has_avatar,
        r.body AS reply_body, r.image_path AS reply_image, r.sender_id AS reply_sender_id, ru.name AS reply_sender
       FROM chat_messages m LEFT JOIN users u ON u.id=m.sender_id
       LEFT JOIN chat_messages r ON r.id=m.reply_to_id LEFT JOIN users ru ON ru.id=r.sender_id WHERE m.id=$1`, [ins.id]);

    // Notify the other members (best-effort push).
    const conv = await one('SELECT * FROM conversations WHERE id=$1', [convId]);
    const others = await q('SELECT user_id FROM conversation_members WHERE conversation_id=$1 AND user_id<>$2 AND blocked=0', [convId, me.id]);
    const title = conv.type === 'group' ? (conv.title || 'Group chat') : me.name;
    const previewText = d.body || '📷 Photo';
    const preview = (conv.type === 'group' ? `${me.name}: ${previewText}` : previewText).slice(0, 140);
    const data = { type: 'chat', conversationId: String(convId), convType: conv.type, chatTitle: title };
    for (const o of others) sendToUser(o.user_id, { title, body: preview, data }).catch(() => {});

    res.json({ message: shapeMessage(row, me.id) });
  } catch (e) { next(e); }
});

// Serve a chat photo (members only).
router.get('/image/:mid', async (req, res, next) => {
  try {
    const m = await one('SELECT conversation_id, image_path FROM chat_messages WHERE id=$1', [Number(req.params.mid)]);
    if (!m || !m.image_path) return res.status(404).end();
    const mem = await membership(m.conversation_id, req.user.id);
    if (!mem) return res.status(403).end();
    if (!(await fileExists(m.image_path))) return res.status(404).end();
    res.set('Content-Type', m.image_path.endsWith('.png') ? 'image/png' : 'image/jpeg');
    res.set('Cache-Control', 'private, max-age=86400');
    streamFile(m.image_path).on('error', () => res.status(404).end()).pipe(res);
  } catch (e) { next(e); }
});

// React to a message (toggle a single emoji per user).
const reactSchema = z.object({ emoji: z.string().min(1).max(8) });
router.post('/messages/:mid/react', async (req, res, next) => {
  try {
    const mid = Number(req.params.mid);
    const parsed = reactSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid reaction' });
    const msg = await one('SELECT conversation_id FROM chat_messages WHERE id=$1', [mid]);
    if (!msg) return res.status(404).json({ error: 'Not found' });
    const mem = await membership(msg.conversation_id, req.user.id);
    if (!mem || mem.blocked) return res.status(403).json({ error: 'Not allowed' });
    const existing = await one('SELECT emoji FROM chat_reactions WHERE message_id=$1 AND user_id=$2', [mid, req.user.id]);
    if (existing && existing.emoji === parsed.data.emoji) {
      await one('DELETE FROM chat_reactions WHERE message_id=$1 AND user_id=$2 RETURNING message_id', [mid, req.user.id]);
    } else {
      await one(`INSERT INTO chat_reactions (message_id, user_id, emoji) VALUES ($1,$2,$3)
                 ON CONFLICT (message_id, user_id) DO UPDATE SET emoji=$3 RETURNING message_id`, [mid, req.user.id, parsed.data.emoji]);
    }
    const [shaped] = await withReactions([{ id: mid }], req.user.id);
    res.json({ messageId: mid, reactions: shaped.reactions });
  } catch (e) { next(e); }
});

// Members of a conversation (for display + admin management of the group).
router.get('/:id/members', async (req, res, next) => {
  try {
    const convId = Number(req.params.id);
    const mem = await membership(convId, req.user.id);
    if (!mem) return res.status(403).json({ error: 'You are not in this chat.' });
    const rows = await q(
      `SELECT u.id, u.name, (u.avatar_path IS NOT NULL) AS has_avatar, cm.blocked, u.role
       FROM conversation_members cm JOIN users u ON u.id=cm.user_id
       WHERE cm.conversation_id=$1 ORDER BY cm.blocked ASC, u.name`, [convId]);
    res.json({ members: rows.map((r) => ({ id: r.id, name: r.name, avatar: !!r.has_avatar, blocked: !!r.blocked, role: r.role })) });
  } catch (e) { next(e); }
});

// ---- Admin moderation of the group ----
async function requireGroupAdmin(req, res) {
  const conv = await one('SELECT * FROM conversations WHERE id=$1', [Number(req.params.id)]);
  if (!conv || conv.type !== 'group') { res.status(400).json({ error: 'Group chats only' }); return null; }
  const me = await meInfo(req.user.id);
  if (!me || me.role !== 'admin' || me.org_id !== conv.org_id) { res.status(403).json({ error: 'Admin only' }); return null; }
  return { conv, me };
}

// Remove / block a member from the group.
router.post('/:id/members/:userId/block', async (req, res, next) => {
  try {
    const ctx = await requireGroupAdmin(req, res); if (!ctx) return;
    const uid = Number(req.params.userId);
    if (uid === ctx.me.id) return res.status(400).json({ error: "You can't remove yourself" });
    await one(
      `INSERT INTO conversation_members (conversation_id, user_id, blocked) VALUES ($1,$2,1)
       ON CONFLICT (conversation_id, user_id) DO UPDATE SET blocked=1 RETURNING conversation_id`, [ctx.conv.id, uid]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Let a removed member back in.
router.post('/:id/members/:userId/unblock', async (req, res, next) => {
  try {
    const ctx = await requireGroupAdmin(req, res); if (!ctx) return;
    const uid = Number(req.params.userId);
    await one(
      `INSERT INTO conversation_members (conversation_id, user_id, blocked) VALUES ($1,$2,0)
       ON CONFLICT (conversation_id, user_id) DO UPDATE SET blocked=0 RETURNING conversation_id`, [ctx.conv.id, uid]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
