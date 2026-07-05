// Messages — list of the gym group + 1-on-1 conversations. Tap "New" to DM any
// member. Polls while focused so unread counts stay fresh.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, FlatList, TouchableOpacity, Modal, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card, Txt, Button, Field } from '../components/UI';
import { Avatar } from '../components/Avatar';
import { ChatAPI, apiError } from '../api/client';
import { colors, font, radius, spacing } from '../theme';

const timeAgo = (s?: string | null) => {
  if (!s) return '';
  const d = new Date((s || '').replace(' ', 'T'));
  const diff = (Date.now() - d.getTime()) / 1000;
  if (isNaN(diff)) return '';
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
};

export default function ChatListScreen({ navigation }: any) {
  const [convs, setConvs] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [picker, setPicker] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const timer = useRef<any>(null);

  const load = useCallback(async () => {
    try { const r = await ChatAPI.conversations(); setConvs(r.conversations || []); } catch { /* ignore */ }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
    timer.current = setInterval(load, 8000);
    return () => clearInterval(timer.current);
  }, [load]));

  const openPicker = async () => {
    setPicker(true);
    try { const r = await ChatAPI.members(); setMembers(r.members || []); }
    catch (e) { setMembers([]); Alert.alert('Could not load members', apiError(e)); }
  };

  const startDM = async (m: any) => {
    try {
      const { conversationId } = await ChatAPI.direct(m.id);
      setPicker(false); setSearch('');
      navigation.navigate('Chat', { conversationId, title: m.name, type: 'direct' });
    } catch (e) { Alert.alert('Could not open chat', apiError(e)); }
  };

  const openConv = (c: any) =>
    navigation.navigate('Chat', { conversationId: c.id, title: c.title, type: c.type, otherId: c.otherId, otherAvatar: c.otherAvatar });

  const filtered = search.trim() ? members.filter((m) => m.name.toLowerCase().includes(search.trim().toLowerCase())) : members;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        contentContainerStyle={{ padding: spacing(2) }}
        data={convs}
        keyExtractor={(c) => String(c.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}
        ListEmptyComponent={<Card><Txt dim>No conversations yet. Say hi to your gym group or message a member 👋</Txt></Card>}
        renderItem={({ item: c }) => (
          <TouchableOpacity onPress={() => openConv(c)}>
            <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
              {c.type === 'group'
                ? <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center', marginRight: spacing(1.5) }}><Txt size={22}>👥</Txt></View>
                : <View style={{ marginRight: spacing(1.5) }}><Avatar userId={c.otherId} name={c.title} hasAvatar={c.otherAvatar} size={46} /></View>}
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Txt weight="800" numberOfLines={1} style={{ flex: 1 }}>{c.title}{c.type === 'group' ? ' 👥' : ''}</Txt>
                  <Txt dim size={font.tiny}>{timeAgo(c.last_at)}</Txt>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                  <Txt dim size={font.small} numberOfLines={1} style={{ flex: 1 }}>{c.last_body || 'No messages yet'}</Txt>
                  {c.unread > 0 ? (
                    <View style={{ backgroundColor: colors.primary, borderRadius: 11, minWidth: 22, height: 22, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', marginLeft: 8 }}>
                      <Txt size={font.tiny} weight="800" style={{ color: '#fff' }}>{c.unread}</Txt>
                    </View>
                  ) : null}
                </View>
              </View>
            </Card>
          </TouchableOpacity>
        )}
      />

      {/* New message FAB */}
      <TouchableOpacity onPress={openPicker} style={{ position: 'absolute', right: spacing(2.5), bottom: spacing(3), backgroundColor: colors.primary, width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } }}>
        <Txt size={26} style={{ color: '#fff' }}>✎</Txt>
      </TouchableOpacity>

      {/* Member picker */}
      <Modal visible={picker} animationType="slide" transparent onRequestClose={() => setPicker(false)}>
        <View style={{ flex: 1, backgroundColor: '#000a', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '82%', padding: spacing(2) }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(1) }}>
              <Txt size={font.h3} weight="800">New message</Txt>
              <TouchableOpacity onPress={() => setPicker(false)}><Txt size={font.h3} dim>✕</Txt></TouchableOpacity>
            </View>
            <Field value={search} onChangeText={setSearch} placeholder="🔍 Search members" />
            <FlatList
              data={filtered}
              keyExtractor={(m) => String(m.id)}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Txt dim style={{ padding: spacing(2) }}>No members found.</Txt>}
              renderItem={({ item: m }) => (
                <TouchableOpacity onPress={() => startDM(m)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}>
                  <View style={{ marginRight: spacing(1.5) }}><Avatar userId={m.id} name={m.name} hasAvatar={m.avatar} size={42} /></View>
                  <Txt weight="700">{m.name}</Txt>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}
