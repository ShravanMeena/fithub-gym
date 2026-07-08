// A conversation thread (group or 1-on-1). Polls for new messages while open.
// Send text + photos, reply to a message, and react with an emoji. Long-press a
// message for the actions. Admins get a "Manage" header action for the group.
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View, FlatList, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, Modal, TextInput, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Card, Txt } from '../components/UI';
import { Avatar } from '../components/Avatar';
import { ChatAPI, chatImageSource, apiError } from '../api/client';
import { scanOrUpload } from '../utils/imagePicker';
import { useAuth } from '../context/AuthContext';
import { colors, font, radius, spacing } from '../theme';

const REACTIONS = ['❤️', '🔥', '👍', '😂', '💪', '🙏'];

const clockTime = (s?: string) => {
  const d = new Date((s || '').replace(' ', 'T'));
  if (isNaN(d.getTime())) return '';
  let h = d.getHours(); const m = d.getMinutes();
  const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
};

// Authed chat photo.
function ChatImage({ url }: { url: string }) {
  const [src, setSrc] = useState<any>(null);
  useEffect(() => { chatImageSource(url).then(setSrc).catch(() => {}); }, [url]);
  return <Image source={src || undefined} style={{ width: 200, height: 200, borderRadius: 12, backgroundColor: colors.cardAlt, marginBottom: 4 }} resizeMode="cover" />;
}

export default function ChatScreen({ navigation, route }: any) {
  const { conversationId, title, type } = route.params;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isGroup = type === 'group';

  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingImage, setPendingImage] = useState<any>(null);
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [actionMsg, setActionMsg] = useState<any>(null); // long-press target
  const [showMembers, setShowMembers] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const listRef = useRef<FlatList>(null);
  const lastId = useRef(0);
  const timer = useRef<any>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: title || 'Chat',
      headerRight: () => (isGroup && isAdmin)
        ? <TouchableOpacity onPress={() => setShowMembers(true)} style={{ paddingHorizontal: 14 }}><Txt weight="800" style={{ color: colors.primary }}>Manage</Txt></TouchableOpacity>
        : null,
    });
  }, [navigation, title, isGroup, isAdmin]);

  // Merge new messages AND refresh reactions/edits for ones we already have.
  const merge = useCallback((incoming: any[], replace = false) => {
    if (!incoming.length && !replace) return;
    setMessages((prev) => {
      const base = replace ? [] : prev;
      const byId = new Map(base.map((m) => [m.id, m]));
      for (const m of incoming) byId.set(m.id, m);
      const next = [...byId.values()].sort((a, b) => a.id - b.id);
      if (next.length) lastId.current = Math.max(lastId.current, next[next.length - 1].id);
      return next;
    });
  }, []);

  const loadInitial = useCallback(async () => {
    try { const r = await ChatAPI.messages(conversationId); lastId.current = 0; merge(r.messages || [], true); }
    catch (e) { Alert.alert('Error', apiError(e)); }
  }, [conversationId, merge]);

  const poll = useCallback(async () => {
    try { const r = await ChatAPI.messages(conversationId, { after: lastId.current }); merge(r.messages || []); } catch { /* ignore */ }
  }, [conversationId, merge]);

  useFocusEffect(useCallback(() => {
    loadInitial();
    timer.current = setInterval(poll, 3000);
    return () => clearInterval(timer.current);
  }, [loadInitial, poll]));

  const send = async () => {
    const body = text.trim();
    if ((!body && !pendingImage) || sending) return;
    const reply = replyingTo;
    const img = pendingImage;
    setSending(true); setText(''); setPendingImage(null); setReplyingTo(null);
    const payload: any = { body: body || undefined, replyToId: reply?.id };
    if (img?.base64) { payload.imageBase64 = img.base64; payload.mediaType = img.type || 'image/jpeg'; }
    try { const r = await ChatAPI.send(conversationId, payload); merge([r.message]); }
    catch (e) { setText(body); setPendingImage(img); setReplyingTo(reply); Alert.alert('Could not send', apiError(e)); }
    finally { setSending(false); }
  };

  const react = async (m: any, emoji: string) => {
    setActionMsg(null);
    try { const r = await ChatAPI.react(m.id, emoji); setMessages((prev) => prev.map((x) => x.id === m.id ? { ...x, reactions: r.reactions } : x)); }
    catch (e) { Alert.alert('Error', apiError(e)); }
  };

  const deleteMessage = (m: any) => {
    setActionMsg(null);
    Alert.alert('Delete message?', m.mine ? '' : 'Remove this member’s message from the chat.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setMessages((prev) => prev.map((x) => x.id === m.id ? { ...x, deleted: true, body: null, imageUrl: null } : x));
        try { await ChatAPI.delMessage(m.id); } catch (e) { Alert.alert('Error', apiError(e)); }
      } },
    ]);
  };

  const openMembers = async () => {
    try { const r = await ChatAPI.convMembers(conversationId); setMembers(r.members || []); } catch { setMembers([]); }
  };
  useEffect(() => { if (showMembers) openMembers(); }, [showMembers]); // eslint-disable-line

  const toggleBlock = async (m: any) => {
    Alert.alert(`${m.blocked ? 'Allow back in' : 'Remove from group'}?`, m.name, [
      { text: 'Cancel', style: 'cancel' },
      { text: m.blocked ? 'Allow' : 'Remove', style: m.blocked ? 'default' : 'destructive', onPress: async () => {
        try {
          if (m.blocked) await ChatAPI.unblock(conversationId, m.id); else await ChatAPI.block(conversationId, m.id);
          setMembers((prev) => prev.map((x) => x.id === m.id ? { ...x, blocked: !m.blocked } : x));
        } catch (e) { Alert.alert('Error', apiError(e)); }
      } },
    ]);
  };

  const renderItem = ({ item: m }: any) => {
    const mine = m.mine;
    return (
      <View style={{ marginBottom: m.reactions?.length ? spacing(1.25) : spacing(1), alignItems: mine ? 'flex-end' : 'flex-start' }}>
        <TouchableOpacity activeOpacity={0.85} onLongPress={() => !m.deleted && setActionMsg(m)} style={{ flexDirection: 'row', justifyContent: mine ? 'flex-end' : 'flex-start', maxWidth: '86%' }}>
          {!mine && isGroup ? <View style={{ marginRight: 8, alignSelf: 'flex-end' }}><Avatar userId={m.senderId} name={m.sender} hasAvatar={m.senderAvatar} size={30} /></View> : null}
          <View style={{ backgroundColor: mine ? colors.primary : colors.card, borderRadius: 16, borderBottomRightRadius: mine ? 4 : 16, borderBottomLeftRadius: mine ? 16 : 4, paddingHorizontal: 10, paddingVertical: 8, borderWidth: mine ? 0 : 1, borderColor: colors.border }}>
            {!mine && isGroup ? <Txt size={font.tiny} weight="800" style={{ color: colors.primary, marginBottom: 2 }}>{m.sender || 'Member'}</Txt> : null}

            {/* Quoted reply */}
            {m.reply ? (
              <View style={{ borderLeftWidth: 3, borderLeftColor: mine ? '#ffffff88' : colors.primary, paddingLeft: 8, paddingVertical: 2, marginBottom: 5, backgroundColor: mine ? '#ffffff1a' : colors.cardAlt, borderRadius: 6 }}>
                <Txt size={font.tiny} weight="800" style={{ color: mine ? '#fff' : colors.primary }}>{m.reply.mine ? 'You' : m.reply.sender}</Txt>
                <Txt size={font.tiny} numberOfLines={1} style={{ color: mine ? '#ffffffcc' : colors.textDim }}>{m.reply.text}</Txt>
              </View>
            ) : null}

            {m.deleted ? (
              <Txt style={{ color: mine ? '#ffffffcc' : colors.textDim, fontStyle: 'italic' }}>🚫 message removed</Txt>
            ) : (
              <>
                {m.imageUrl ? <ChatImage url={m.imageUrl} /> : null}
                {m.body ? <Txt style={{ color: mine ? '#fff' : colors.text, lineHeight: 20 }}>{m.body}</Txt> : null}
              </>
            )}
            <Txt size={9} style={{ color: mine ? '#ffffffaa' : colors.textDim, marginTop: 3, textAlign: 'right' }}>{clockTime(m.created_at)}</Txt>
          </View>
        </TouchableOpacity>

        {/* Reactions */}
        {m.reactions?.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: -6, marginHorizontal: isGroup && !mine ? 38 : 0 }}>
            {m.reactions.map((rx: any) => (
              <TouchableOpacity key={rx.emoji} onPress={() => react(m, rx.emoji)}
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: rx.mine ? colors.primary + '22' : colors.cardAlt, borderWidth: 1, borderColor: rx.mine ? colors.primary : colors.border, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, marginRight: 4 }}>
                <Txt size={12}>{rx.emoji}</Txt>
                {rx.count > 1 ? <Txt size={font.tiny} weight="700" style={{ marginLeft: 3 }}>{rx.count}</Txt> : null}
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </View>
    );
  };

  const canDelete = actionMsg && (actionMsg.mine || isAdmin);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <FlatList
        ref={listRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing(2), flexGrow: 1 }}
        data={messages}
        keyExtractor={(m) => String(m.id)}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={<Card><Txt dim>{isGroup ? 'Welcome to the gym group! Be the first to say something 💬' : 'Say hi 👋'}</Txt></Card>}
      />

      {/* Reply preview */}
      {replyingTo ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing(2), paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card }}>
          <View style={{ width: 3, alignSelf: 'stretch', backgroundColor: colors.primary, borderRadius: 2, marginRight: 8 }} />
          <View style={{ flex: 1 }}>
            <Txt size={font.tiny} weight="800" style={{ color: colors.primary }}>Replying to {replyingTo.mine ? 'yourself' : replyingTo.sender}</Txt>
            <Txt size={font.tiny} dim numberOfLines={1}>{replyingTo.imageUrl && !replyingTo.body ? '📷 Photo' : replyingTo.body}</Txt>
          </View>
          <TouchableOpacity onPress={() => setReplyingTo(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Txt dim>✕</Txt></TouchableOpacity>
        </View>
      ) : null}

      {/* Pending image preview */}
      {pendingImage?.uri ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing(2), paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card }}>
          <Image source={{ uri: pendingImage.uri }} style={{ width: 48, height: 48, borderRadius: 8 }} />
          <Txt dim size={font.small} style={{ marginLeft: 10, flex: 1 }}>Photo ready to send</Txt>
          <TouchableOpacity onPress={() => setPendingImage(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Txt dim>✕</Txt></TouchableOpacity>
        </View>
      ) : null}

      {/* Composer */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: spacing(1), paddingTop: spacing(1), paddingBottom: Math.max(spacing(1), insets.bottom + 6), borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card }}>
        <TouchableOpacity onPress={() => scanOrUpload((a: any) => setPendingImage(a))} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}>
          <Txt size={22}>🖼</Txt>
        </TouchableOpacity>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Message…"
          placeholderTextColor={colors.textDim}
          multiline
          style={{ flex: 1, color: colors.text, backgroundColor: colors.bg, borderRadius: 20, paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 10 : 6, maxHeight: 110, borderWidth: 1, borderColor: colors.border }}
        />
        <TouchableOpacity onPress={send} disabled={sending || (!text.trim() && !pendingImage)} style={{ marginLeft: 8, width: 44, height: 44, borderRadius: 22, backgroundColor: (text.trim() || pendingImage) ? colors.primary : colors.border, alignItems: 'center', justifyContent: 'center' }}>
          <Txt size={18} style={{ color: '#fff' }}>➤</Txt>
        </TouchableOpacity>
      </View>

      {/* Long-press actions: react / reply / delete */}
      <Modal visible={!!actionMsg} transparent animationType="fade" onRequestClose={() => setActionMsg(null)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setActionMsg(null)} style={{ flex: 1, backgroundColor: '#000a', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: spacing(2), paddingBottom: insets.bottom + spacing(2) }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: spacing(1.5) }}>
              {REACTIONS.map((e) => (
                <TouchableOpacity key={e} onPress={() => actionMsg && react(actionMsg, e)} style={{ padding: 6 }}><Txt size={30}>{e}</Txt></TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={() => { setReplyingTo(actionMsg); setActionMsg(null); }} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Txt size={18} style={{ marginRight: 12 }}>↩️</Txt><Txt weight="600" size={font.body}>Reply</Txt>
            </TouchableOpacity>
            {canDelete ? (
              <TouchableOpacity onPress={() => actionMsg && deleteMessage(actionMsg)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Txt size={18} style={{ marginRight: 12 }}>🗑</Txt><Txt weight="600" size={font.body} style={{ color: colors.danger }}>Delete</Txt>
              </TouchableOpacity>
            ) : null}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Admin: manage members */}
      <Modal visible={showMembers} animationType="slide" transparent onRequestClose={() => setShowMembers(false)}>
        <View style={{ flex: 1, backgroundColor: '#000a', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '82%', padding: spacing(2), paddingBottom: insets.bottom + spacing(2) }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(1) }}>
              <Txt size={font.h3} weight="800">Group members</Txt>
              <TouchableOpacity onPress={() => setShowMembers(false)}><Txt size={font.h3} dim>✕</Txt></TouchableOpacity>
            </View>
            <Txt dim size={font.small} style={{ marginBottom: spacing(1) }}>Remove a member to block them from posting. You can allow them back anytime.</Txt>
            <FlatList
              data={members}
              keyExtractor={(m) => String(m.id)}
              renderItem={({ item: m }) => (
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}>
                  <View style={{ marginRight: spacing(1.5) }}><Avatar userId={m.id} name={m.name} hasAvatar={m.avatar} size={40} /></View>
                  <View style={{ flex: 1 }}>
                    <Txt weight="700">{m.name}{m.role === 'admin' ? ' 👑' : ''}</Txt>
                    {m.blocked ? <Txt size={font.tiny} style={{ color: colors.danger }}>Removed</Txt> : null}
                  </View>
                  {m.id !== user?.id ? (
                    <TouchableOpacity onPress={() => toggleBlock(m)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: m.blocked ? colors.primary : colors.danger + '22', borderWidth: 1, borderColor: m.blocked ? colors.primary : colors.danger }}>
                      <Txt size={font.small} weight="800" style={{ color: m.blocked ? '#fff' : colors.danger }}>{m.blocked ? 'Allow' : 'Remove'}</Txt>
                    </TouchableOpacity>
                  ) : <Txt dim size={font.tiny}>You</Txt>}
                </View>
              )}
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
