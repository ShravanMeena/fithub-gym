// Collectible badges — earned from your own consistency. A reason to keep going.
import React, { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card, Txt } from '../components/UI';
import { MeAPI } from '../api/client';
import { colors, font, spacing } from '../theme';

export default function BadgesScreen() {
  const [d, setD] = useState<any>(null);
  useFocusEffect(useCallback(() => { MeAPI.badges().then(setD).catch(() => {}); }, []));
  const badges = d?.badges || [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(2) }}>
      <Txt size={font.h2} weight="800">Badges 🏅</Txt>
      <Txt dim style={{ marginBottom: spacing(2) }}>{d ? `${d.earnedCount} of ${d.total} unlocked — keep going!` : 'Earn badges by showing up and staying consistent.'}</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        {badges.map((b: any) => (
          <Card key={b.key} style={{ width: '48.5%', alignItems: 'center', opacity: b.earned ? 1 : 0.5, borderColor: b.earned ? colors.primary : colors.border }}>
            <Txt size={42}>{b.earned ? b.emoji : '🔒'}</Txt>
            <Txt weight="800" style={{ marginTop: 6, textAlign: 'center' }}>{b.label}</Txt>
            <Txt dim size={font.tiny} style={{ textAlign: 'center', marginTop: 2 }}>{b.desc}</Txt>
          </Card>
        ))}
      </View>
      <View style={{ height: spacing(4) }} />
    </ScrollView>
  );
}
