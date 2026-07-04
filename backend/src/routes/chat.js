// Chat: 1-on-1 direct messages + a per-gym group chat. Admins can moderate the
// group (remove/block members, delete any message). HTTP + polling from the app.
import { Router } from 'express';
import { z } from 'zod';
import { q, one } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { sendToUser } from '../services/push.js';

const router = Router();
router.use(authRequired);

const meInfo = (userId) => one('SELECT id, name, org_id, role FROM users WHERE id = $1', [userId]);
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
    const SEL = `m.id, m.sender_id, m.body, m.deleted, m.created_at, u.name AS sender, (u.avatar_path IS NOT NULL) AS has_avatar
                 FROM chat_messages m LEFT JOIN users u ON u.id=m.sender_id`;
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
    res.json({
      messages: rows.map((m) => ({
        id: m.id, senderId: m.sender_id, sender: m.sender, senderAvatar: !!m.has_avatar,
        body: m.deleted ? null : m.body, deleted: !!m.deleted, created_at: m.created_at, mine: m.sender_id === req.user.id,
      })),
    });
  } catch (e) { next(e); }
});

const sendSchema = z.object({ body: z.string().trim().min(1).max(2000) });
router.post('/:id/messages', async (req, res, next) => {
  try {
    const convId = Number(req.params.id);
    const mem = await membership(convId, req.user.id);
    if (!mem) return res.status(403).json({ error: 'You are not in this chat.' });
    if (mem.blocked) return res.status(403).json({ error: 'You have been removed from this chat.' });
    const parsed = sendSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const me = await meInfo(req.user.id);
    const body = parsed.data.body;
    const msg = await one('INSERT INTO chat_messages (conversation_id, sender_id, body) VALUES ($1,$2,$3) RETURNING *', [convId, me.id, body]);
    await one('UPDATE conversation_members SET last_read_id=$1 WHERE conversation_id=$2 AND user_id=$3 RETURNING conversation_id', [msg.id, convId, me.id]);

    // Notify the other members (best-effort push).
    const conv = await one('SELECT * FROM conversations WHERE id=$1', [convId]);
    const others = await q('SELECT user_id FROM conversation_members WHERE conversation_id=$1 AND user_id<>$2 AND blocked=0', [convId, me.id]);
    const title = conv.type === 'group' ? (conv.title || 'Group chat') : me.name;
    const preview = (conv.type === 'group' ? `${me.name}: ${body}` : body).slice(0, 140);
    for (const o of others) sendToUser(o.user_id, { title, body: preview, data: { type: 'chat', conversationId: String(convId) } }).catch(() => {});

    res.json({ message: { id: msg.id, senderId: me.id, sender: me.name, senderAvatar: false, body: msg.body, deleted: false, created_at: msg.created_at, mine: true } });
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
