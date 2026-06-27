// Gym leaderboard — who's shown up the most this week / month. Community feature
// built from attendance. Your own row is highlighted; medals for the top 3.
import React, { useCallback, useState } from 'react';
import { ScrollView, View, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card, Txt, Pill } from '../components/UI';
import { ChallengeAPI } from '../api/client';
import { useOrg } from '../context/OrgContext';
import { colors, font, radius, spacing } from '../theme';

const medal = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`);

export default function ChallengesScreen() {
  const { org } = useOrg();
  const [period, setPeriod] = useState<'month' | 'week'>('month');
  const [data, setData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (p = period) => {
    try { setData(await ChallengeAPI.leaderboard(p)); } catch {}
  }, [period]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const board = data?.leaderboard || [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing(2) }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}>

      <Txt size={font.h2} weight="800">🏆 {org?.name || 'Gym'} Leaderboard</Txt>
      <Txt dim style={{ marginBottom: spacing(2) }}>Most check-ins — keep showing up to climb!</Txt>

      <View style={{ flexDirection: 'row', marginBottom: spacing(2) }}>
        <Pill label="This month" active={period === 'month'} onPress={() => { setPeriod('month'); load('month'); }} />
        <Pill label="This week" active={period === 'week'} onPress={() => { setPeriod('week'); load('week'); }} />
      </View>

      {/* Your standing */}
      {data?.me && (
        <Card style={{ borderColor: colors.primary, marginBottom: spacing(2) }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Txt dim size={font.small}>Your rank</Txt>
              <Txt size={font.h1} weight="900" style={{ color: colors.primary }}>
                {data.me.rank ? `#${data.me.rank}` : '—'}
              </Txt>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Txt size={font.h2} weight="900">{data.me.value}</Txt>
              <Txt dim size={font.tiny}>check-in days</Txt>
            </View>
          </View>
        </Card>
      )}

      {board.length === 0 ? (
        <Card><Txt dim>No check-ins yet this {period}. Be the first on the board! 💪</Txt></Card>
      ) : (
        board.map((r: any) => (
          <View
            key={r.rank}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              backgroundColor: r.isMe ? colors.primary + '22' : colors.card,
              borderWidth: 1, borderColor: r.isMe ? colors.primary : colors.border,
              borderRadius: radius.md, padding: spacing(1.5), marginBottom: 8,
            }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <Txt size={font.h3} weight="900" style={{ width: 40 }}>{medal(r.rank)}</Txt>
              <Txt weight={r.isMe ? '900' : '700'}>{r.name}{r.isMe ? '  (you)' : ''}</Txt>
            </View>
            <Txt weight="800" style={{ color: colors.primary }}>{r.value} <Txt dim size={font.tiny}>days</Txt></Txt>
          </View>
        ))
      )}
      <View style={{ height: spacing(4) }} />
    </ScrollView>
  );
}
