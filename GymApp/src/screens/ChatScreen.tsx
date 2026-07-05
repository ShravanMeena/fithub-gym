// A conversation thread (group or 1-on-1). Polls for new messages while open.
// Long-press a message to delete it (your own, or any if you're a gym admin).
// Admins get a "Manage" header action to remove/re-add members in the group.
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View, FlatList, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, Modal, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card, Txt } from '../components/UI';
import { Avatar } from '../components/Avatar';
import { ChatAPI, apiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { colors, font, radius, spacing } from '../theme';

const clockTime = (s?: string) => {
  const d = new Date((s || '').replace(' ', 'T'));
  if (isNaN(d.getTime())) return '';
  let h = d.getHours(); const m = d.getMinutes();
  const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
};

export default function ChatScreen({ navigation, route }: any) {
  const { conversationId, title, type } = route.params;
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isGroup = type === 'group';

  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
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

  const merge = useCallback((incoming: any[], replace = false) => {
    if (!incoming.length && !replace) return;
    setMessages((prev) => {
      const base = replace ? [] : prev;
      const seen = new Set(base.map((m) => m.id));
      const next = [...base, ...incoming.filter((m) => !seen.has(m.id))];
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
    if (!body || sending) return;
    setSending(true); setText('');
    try { const r = await ChatAPI.send(conversationId, body); merge([r.message]); }
    catch (e) { setText(body); Alert.alert('Could not send', apiError(e)); }
    finally { setSending(false); }
  };

  const onLongPress = (m: any) => {
    if (m.deleted) return;
    const canDelete = m.mine || isAdmin;
    if (!canDelete) return;
    Alert.alert('Delete message?', m.mine ? '' : 'Remove this member’s message from the chat.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setMessages((prev) => prev.map((x) => x.id === m.id ? { ...x, deleted: true, body: null } : x));
        try { await ChatAPI.delMessage(m.id); } catch (e) { Alert.alert('Error', apiError(e)); }
      } },
    ]);
  };

  const openMembers = async () => {
    try { const r = await ChatAPI.convMembers(conversationId); setMembers(r.members || []); } catch { setMembers([]); }
  };
  useEffect(() => { if (showMembers) openMembers(); }, [showMembers]); // eslint-disable-line

  const toggleBlock = async (m: any) => {
    const action = m.blocked ? 'Allow back in' : 'Remove from group';
    Alert.alert(`${action}?`, m.name, [
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
      <TouchableOpacity activeOpacity={0.85} onLongPress={() => onLongPress(m)} style={{ marginBottom: spacing(1), flexDirection: 'row', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
        {!mine && isGroup ? <View style={{ marginRight: 8, alignSelf: 'flex-end' }}><Avatar userId={m.senderId} name={m.sender} hasAvatar={m.senderAvatar} size={30} /></View> : null}
        <View style={{ maxWidth: '78%', backgroundColor: mine ? colors.primary : colors.card, borderRadius: 16, borderBottomRightRadius: mine ? 4 : 16, borderBottomLeftRadius: mine ? 16 : 4, paddingHorizontal: 12, paddingVertical: 8, borderWidth: mine ? 0 : 1, borderColor: colors.border }}>
          {!mine && isGroup ? <Txt size={font.tiny} weight="800" style={{ color: colors.primary, marginBottom: 2 }}>{m.sender || 'Member'}</Txt> : null}
          {m.deleted
            ? <Txt style={{ color: mine ? '#ffffffcc' : colors.textDim, fontStyle: 'italic' }}>🚫 message removed</Txt>
            : <Txt style={{ color: mine ? '#fff' : colors.text, lineHeight: 20 }}>{m.body}</Txt>}
          <Txt size={9} style={{ color: mine ? '#ffffffaa' : colors.textDim, marginTop: 3, textAlign: 'right' }}>{clockTime(m.created_at)}</Txt>
        </View>
      </TouchableOpacity>
    );
  };

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

      {/* Composer */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', padding: spacing(1), paddingBottom: Platform.OS === 'ios' ? spacing(1) : spacing(1.5), borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Message…"
          placeholderTextColor={colors.textDim}
          multiline
          style={{ flex: 1, color: colors.text, backgroundColor: colors.bg, borderRadius: 20, paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 10 : 6, maxHeight: 110, borderWidth: 1, borderColor: colors.border }}
        />
        <TouchableOpacity onPress={send} disabled={sending || !text.trim()} style={{ marginLeft: 8, width: 44, height: 44, borderRadius: 22, backgroundColor: text.trim() ? colors.primary : colors.border, alignItems: 'center', justifyContent: 'center' }}>
          <Txt size={18} style={{ color: '#fff' }}>➤</Txt>
        </TouchableOpacity>
      </View>

      {/* Admin: manage members */}
      <Modal visible={showMembers} animationType="slide" transparent onRequestClose={() => setShowMembers(false)}>
        <View style={{ flex: 1, backgroundColor: '#000a', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '82%', padding: spacing(2) }}>
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
