import React, { useCallback, useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card, Txt } from './UI';
import { NoticeAPI } from '../api/client';
import { colors, font, radius, spacing } from '../theme';

// Highlighted, dismissible admin notices on the Home screen.
export function NoticeBanner() {
  const [notices, setNotices] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      const { notices } = await NoticeAPI.active();
      setNotices(notices);
      // mark each as seen (view tracking for the admin)
      notices.forEach((n: any) => NoticeAPI.seen(n.id).catch(() => {}));
    } catch { /* ignore */ }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const remove = (id: number) => setNotices((prev) => prev.filter((n) => n.id !== id));

  const dismiss = (n: any) => { remove(n.id); NoticeAPI.dismiss(n.id).catch(() => {}); };
  const respond = (n: any, r: 'yes' | 'no' | 'ack') => { remove(n.id); NoticeAPI.respond(n.id, r).catch(() => {}); };

  if (notices.length === 0) return null;

  return (
    <>
      {notices.map((n) => (
        <Card key={n.id} style={{ borderColor: colors.primary, backgroundColor: colors.primary + '14' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Txt size={font.tiny} weight="800" style={{ color: colors.primary, marginBottom: 4 }}>📢 IMPORTANT</Txt>
              <Txt weight="800">{n.title}</Txt>
              {n.body ? <Txt dim size={font.small} style={{ marginTop: 4, lineHeight: 20 }}>{n.body}</Txt> : null}
            </View>
            <TouchableOpacity onPress={() => dismiss(n)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Txt size={18} dim>✕</Txt>
            </TouchableOpacity>
          </View>

          {n.type === 'ack' ? (
            <TouchableOpacity onPress={() => respond(n, 'ack')} style={{ marginTop: spacing(1.5), backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 11, alignItems: 'center' }}>
              <Txt weight="800" style={{ color: '#fff' }}>Got it 👍</Txt>
            </TouchableOpacity>
          ) : null}

          {n.type === 'yesno' ? (
            <View style={{ flexDirection: 'row', gap: spacing(1.5), marginTop: spacing(1.5) }}>
              <TouchableOpacity onPress={() => respond(n, 'yes')} style={{ flex: 1, backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 11, alignItems: 'center' }}>
                <Txt weight="800" style={{ color: '#fff' }}>Yes</Txt>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => respond(n, 'no')} style={{ flex: 1, backgroundColor: colors.cardAlt, borderRadius: radius.md, paddingVertical: 11, alignItems: 'center' }}>
                <Txt weight="800">No</Txt>
              </TouchableOpacity>
            </View>
          ) : null}
        </Card>
      ))}
    </>
  );
}
